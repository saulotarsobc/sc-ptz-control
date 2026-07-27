# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desenvolvimento
pnpm build:bridge   # compila o sidecar C# (obrigatório antes do primeiro `pnpm dev`)
pnpm dev            # Vite + Electron (HMR); o main sobe o sidecar automaticamente
pnpm build          # tsc + vite build
pnpm lint           # ESLint

# Distribuição
pnpm publish:bridge # dotnet publish self-contained -> native/PtzBridge/publish/
pnpm dist           # generate-electron-builder -> publish:bridge -> build -> electron-builder -> out/
```

Não há testes automatizados. A verificação é manual contra o equipamento.

**`pnpm lint` está quebrado por incompatibilidade de dependências** (`typescript-eslint` 8 não
suporta o `typescript` 7 que o projeto usa). Não é regressão do código — use `npx tsc --noEmit`
para checagem de tipos.

## Arquitetura

**SC PTZ Control** controla câmeras PTZ em NVR/DVR Intelbras pelo **NetSDK nativo** (protocolo
privado Dahua na porta 37777), não pela API HTTP CGI. O SDK dá o que o CGI não dá: PTZ completo
com velocidade (pan/tilt/zoom/foco/íris), H.264 decodificado localmente e vídeo ao vivo.

```
Electron main (backend/main.ts)
  └─ spawn: native/PtzBridge/…/PtzBridge.exe --port 0 --token <hex>
       │  stdout linha 1: {"ready":true,"port":51234}
       │
       └─ sidecar C# escutando em 127.0.0.1 (token obrigatório)
            ├─ /ws/control          JSON    — login, PTZ, presets, config, eventos
            ├─ /ws/video?channel=N  binário — frames NV12
            └─ /api/thumb/{ch}/{n}  GET/PUT/DELETE — miniaturas JPEG
  └─ preload: window.ptz.getBridge() → {port, token}

Renderer (React 19 + Mantine 9) abre as duas WebSockets direto em 127.0.0.1.
```

O sidecar é o **único dono do estado**: sessão do SDK, configuração e miniaturas. O main do
Electron é só um lançador. O renderer não fala com o NVR — por isso `webSecurity` fica ligado
(diferente das versões anteriores, que precisavam desligá-lo para o Digest funcionar no browser).

### O sidecar C# (`native/PtzBridge/`)

.NET 8, x64, **Windows apenas**, sem nenhuma dependência NuGet.

| Arquivo | Papel |
|---|---|
| `Sdk/SdkHost.cs` | `CLIENT_Init`/`Cleanup` com contagem de referência + os callbacks globais |
| `Sdk/NvrClient.cs` | Wrapper do NETClient: login, real-play, PTZ, presets, snapshot |
| `Sdk/PlaySdkNative.cs` | P/Invoke da `dhplay.dll` (decodificador) |
| `Sdk/YuvScaler.cs` | I420 → NV12 reduzido, com mapas nearest-neighbor pré-computados |
| `Sdk/AppConfig.cs` | `%APPDATA%/sc-ptz-control/config.json` + caminhos de miniatura |
| `Sdk/Dpapi.cs` | Cifra a senha do NVR com DPAPI no escopo do usuário |
| `Streaming/ChannelStream.cs` | Pipeline de um canal (ver abaixo) |
| `Streaming/VideoHub.cs` | Um stream por canal, ligado/desligado por contagem de assinantes |
| `Server/NvrService.cs` | Orquestra tudo; serializa as chamadas ao SDK sob um lock |
| `Server/PtzWatchdog.cs` | Parada automática do PTZ (ver abaixo) |
| `Server/Http.cs` | HTTP/1.1 mínimo + handshake de WebSocket sobre `TcpListener` |
| `Server/BridgeServer.cs` | Roteamento, token, CORS, miniaturas |

O `.csproj` compila o wrapper oficial `NetSDKCS` **direto da pasta de demos do SDK** e copia as 15
DLLs nativas para junto do `.exe`. Ele resolve `NetSdkRoot` como `..\..\..\helpers\NetSDK 3.050\…`,
ou seja, **só compila com o repo dentro do monorepo `ls-brasil-monorepo`**, onde existe a pasta
`helpers/` (que é git-ignorada e precisa ser obtida à parte). Fora dele:

```powershell
dotnet build native/PtzBridge -p:NetSdkRoot="C:\caminho\para\...190304"
```

O erro `NetSDK não encontrado` significa `helpers/` ausente, não código quebrado.

### Detalhes que não podem ser perdidos

**Pipeline de vídeo** (`ChannelStream`) — real-play com `hWnd = IntPtr.Zero`, que faz o SDK
entregar o stream cru em vez de desenhar numa janela:

```
PLAY_GetFreePort → SetStreamOpenMode(REALTIME) → OpenStream(4MB)
  → SetDecCBStream(VÍDEO) → SetDecCallBackEx → PLAY_Play(hWnd=0)
StartRealPlay(ch, IntPtr.Zero) → SetRealDataCallBack(RAW_DATA)
  → OnRawData: PLAY_InputData  → OnDecodedFrame: I420 → YuvScaler → NV12 → WebSocket
```

Duas invariantes: os delegates de callback ficam em **campos** (o SDK guarda o ponteiro nativo e o
GC coletaria um lambda local) e **nenhuma exceção pode escapar dos callbacks** para o código nativo.

**Watchdog de PTZ** (`PtzWatchdog`) — comando contínuo tem prazo de 1200 ms por (canal, eixo). Sem
re-arme, o backend emite a parada sozinho; o `HoldButton` do frontend re-arma a cada 500 ms. Perder
o cliente de controle solta tudo na hora. Sem isso, um renderer travado deixaria o motor girando
indefinidamente — que é o comportamento do play-nvr e um risco real com o comando vindo pela rede.

**Reconexão** — o SDK reconecta sozinho (`CLIENT_SetAutoReconnect`), mas depois disso o handle de
**login continua válido enquanto os de real-play estão mortos**. Por isso `VideoHub.ResumeAll()`
reemite `StartRealPlay` em vez de só religar o callback.

**Canais** são 1-based no protocolo e na UI; a conversão para a base 0 do SDK acontece só na borda
do `NvrService`.

**Contrato binário do vídeo** — cabeçalho de 16 bytes (`VideoFrameHeader` no C#, as constantes no
topo de `useVideoStream.ts`) seguido do NV12. Mexeu num lado, mexa no outro.

### Renderer (`src/`)

Quatro rotas em `HashRouter`: `/` (presets + controles), `/hall-map`, `/settings`, `/help`.

- **`src/context/BridgeProvider.tsx`** — estado compartilhado entre as telas: sidecar, enlace,
  configuração, status da sessão, canal e velocidade. Fica **fora** do `Router` para a sessão não
  reiniciar a cada navegação.
- **`src/services/bridge/client.ts`** — WebSocket de controle: correlação por `id`, fila enquanto
  reconecta, backoff.
- **`src/services/bridge/usePresets.ts`** — lista de presets com a URL da miniatura resolvida.
- **`src/components/LiveView/useVideoStream.ts`** — desenha os frames com `VideoFrame` do WebCodecs
  (NV12 direto, conversão YUV→RGB na GPU); há um caminho manual em `ImageData` como reserva. O
  `frame.close()` é obrigatório — sem ele cada frame vaza memória de GPU.
- **`src/components/PtzPad/HoldButton.tsx`** — captura de ponteiro (não `mouseleave`) para o
  "soltar" chegar mesmo com o cursor fora do botão, e o re-arme do watchdog.

**Miniaturas** são capturadas do frame que já está na tela (`canvas.toBlob`) e enviadas por
`PUT /api/thumb`. É bem mais rápido que pedir ao equipamento — o `SnapPictureEx` do SDK é
assíncrono, limitado a D1 e aceita uma requisição por vez.

**Estado local** — o mapa de assentos e a preferência de exibir os controles (`localStorage`,
`src/services/storage.ts`). Configuração e miniaturas são do sidecar. As versões anteriores
guardavam credenciais em texto puro e até 100 JPEGs em base64 no `localStorage`, estourando a cota.

**Presets são só números.** Não há nome — foi uma decisão explícita do usuário, então não
reintroduza o campo achando que é uma melhoria.

## Convenções

- **Português (pt-BR)** em comentários, documentação e textos de interface.
- Comentário explica **o porquê** (uma invariante, um contorno), não narra o código.
- `"type": "module"` — todo arquivo Node usa ESM.
- O script `dist` chama `bun` para os geradores, embora o resto do projeto use `pnpm`.
