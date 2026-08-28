# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desenvolvimento
pnpm build:bridge   # compila o sidecar C# (obrigatório antes do primeiro `pnpm dev`)
pnpm dev            # Vite + Electron (HMR); o main sobe o sidecar automaticamente
pnpm build          # tsc + vite build
pnpm lint           # ESLint

# Câmera virtual (uma vez, opcional em dev)
pnpm build:vcam     # CMake + MSVC -> native/ScPtzVCam/build/Release/ScPtzVCam.dll
pnpm install:vcam   # registra o COM em HKLM — exige terminal ADMINISTRADOR

# Distribuição
pnpm publish:bridge # dotnet publish self-contained -> native/PtzBridge/publish/
pnpm dist           # dist:prepare -> electron-builder -> out/
                    # (dist:prepare = generate-electron-builder -> build:vcam -> publish:bridge -> build)

# Release
pnpm release        # tag + changelog + Release no GitHub + build com --publish always
pnpm release:dry    # simula tudo sem alterar nada
pnpm release:notes  # imprime só o changelog
```

Não há testes automatizados contra o equipamento. `pnpm lint`, `pnpm build` e
`pnpm build:bridge` são as verificações locais mínimas. O projeto permanece na linha
TypeScript 5.9 porque o `typescript-eslint` 8 ainda não suporta TypeScript 7.

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
            ├─ /ws/control          JSON    — login, PTZ, presets, config, câmera virtual, eventos
            ├─ /ws/video?channel=N  binário — frames NV12
            ├─ /api/thumb/{ch}/{n}  GET/PUT/DELETE — miniaturas JPEG
            └─ câmera virtual — NV12 720p em memória compartilhada (fora da rede)
  └─ preload: window.ptz.getBridge() → {port, token}

Renderer (React 19 + Mantine 9) abre as duas WebSockets direto em 127.0.0.1.
```

O sidecar é o **único dono do estado**: sessão do SDK, configuração e miniaturas. O main do
Electron é só um lançador. O renderer não fala com o NVR — por isso `webSecurity` fica ligado
(diferente das versões anteriores, que precisavam desligá-lo para o Digest funcionar no browser).

### Práticas Electron da v6

As referências normativas são os guias oficiais de
[performance](https://www.electronjs.org/docs/latest/tutorial/performance) e
[segurança](https://www.electronjs.org/docs/latest/tutorial/security). Preserve estas invariantes:

- A janela aparece antes de o sidecar terminar de subir; o renderer representa `starting`.
- `electron-updater` é importado dinamicamente após `did-finish-load`, fora do caminho crítico.
- O main não usa IPC síncrono nem I/O síncrono em operações de runtime.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` e `webSecurity` ligado.
- O preload expõe funções específicas, nunca `ipcRenderer` ou o evento IPC bruto.
- Todo `ipcMain.handle` valida `sender`, `senderFrame` e o frame principal.
- CSP restringe scripts à própria aplicação e rede do renderer somente ao sidecar em loopback.
- Permissões Chromium são negadas por padrão; navegações e novas janelas são bloqueadas.
- URLs externas passam por allowlist estrita antes de `shell.openExternal`.
- A rota principal é eager; telas secundárias usam code-splitting com skeleton sem layout shift.

Antes de otimizar novamente, meça startup, CPU, memória e bundle. Não troque segurança por
desempenho e não mova frames de vídeo pelo IPC do Electron: o WebSocket local evita esse salto.

### O sidecar C# (`native/PtzBridge/`)

.NET 8, Windows x64, sem nenhuma dependência NuGet. A v6 exige o NetSDK e não possui fallback
RTSP/FFmpeg: um build sem o SDK deve falhar cedo para não trocar o pipeline de baixa latência.

| Arquivo | Papel |
|---|---|
| `Nvr/INvrBackend.cs` | Contrato interno do NetSDK e do pipeline de vídeo |
| `NetSdk/SdkHost.cs` | `CLIENT_Init`/`Cleanup` com contagem de referência + callbacks globais |
| `NetSdk/NvrClient.cs` | Backend NETClient: login, real-play, PTZ e presets |
| `NetSdk/PlaySdkNative.cs` | P/Invoke da `dhplay.dll` (decodificador Windows) |
| `Sdk/YuvScaler.cs` | I420 → NV12 reduzido, com mapas nearest-neighbor pré-computados |
| `Sdk/AppConfig.cs` | `%APPDATA%/sc-ptz-control/config.json` + caminhos de miniatura |
| `Platform/AppPaths.cs` | Caminhos persistentes do Windows |
| `Streaming/VideoHub.cs` | Um stream por canal, ligado/desligado por contagem de assinantes |
| `Server/NvrService.cs` | Orquestra tudo; serializa as chamadas ao SDK sob um lock |
| `Server/PtzWatchdog.cs` | Parada automática do PTZ (ver abaixo) |
| `Server/Http.cs` | HTTP/1.1 mínimo + handshake de WebSocket sobre `TcpListener` |
| `Server/BridgeServer.cs` | Roteamento, token, CORS, miniaturas |
| `VirtualCamera/VirtualCameraService.cs` | Orquestra a câmera Media Foundation do Windows 11 |
| `VirtualCamera/NoSignalFrame.cs` | Quadro preto com "Sem sinal!", sem dependência gráfica nativa |

O `.csproj` pode compilar o wrapper oficial `NetSDKCS` **direto da pasta de demos do SDK** e copiar
as DLLs nativas para junto do `.exe` no Windows. Ele resolve `NetSdkRoot` como
`..\..\..\helpers\NetSDK 3.050\…`, caminho usado no monorepo. Fora dele, informe o SDK
explicitamente:

```powershell
dotnet build native/PtzBridge -p:NetSdkRoot="C:\caminho\para\...190304"
```

Sem `helpers/`, o bridge não compila. Essa exigência impede que uma distribuição Windows seja
gerada sem as DLLs nativas e caia silenciosamente num caminho mais lento.

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

### Câmera virtual (`native/ScPtzVCam/` + `VirtualCamera/`)

Publica o canal ativo como **`SC PTZ Virtual Cam`** (OBS, Meet, Teams) no Windows 11, usando
Media Foundation e o buffer compartilhado abaixo.

```
ChannelStream.I420Ready (fonte cheia)  →  YuvScaler(1280)  →  NV12 1280x720
  →  SharedFrameWriter  →  %ProgramData%\ScPtzControl\vcam-frames.bin  (triplo buffer)
       →  ScPtzVCam.dll carregada pelo Frame Server  →  IMFMediaStream::RequestSample
```

- **Um real-play só.** A câmera virtual entra como assinante do `VideoHub`, então ela
  reaproveita o decode do preview. O que ela NÃO reaproveita é a escala: assina o
  `I420Ready` (fonte crua) para ir direto a 720p, porque passar pelo preview reduzido
  (`maxVideoWidth`, 960 por padrão) reamostraria duas vezes e borraria a imagem.
- **Ser assinante também é o que mantém o vídeo no ar** com os controles escondidos.
- **Sem imagem ≠ sem câmera.** Ligar com o NVR fora do ar não falha: o dispositivo sobe e um
  timer de 200 ms publica o quadro `NoSignalFrame` (preto + "Sem sinal!"). A assinatura fica
  pendente e `EnsureSubscribed()` a resolve quando a sessão sobe. O quadro liso da media
  source nativa só aparece se o aplicativo inteiro estiver fechado.
- **O CLSID é identidade.** `{FF324BA5-…}` aparece em `Guids.h`, `scripts/install-vcam.ps1` e
  `build/installer.nsh` — os três precisam concordar, e ele é diferente do CLSID do play-nvr
  de propósito: as duas câmeras convivem na mesma máquina.
- **Contrato do buffer** em `SharedFrame.h` e `SharedFrameProtocol.cs` (magic `SPV1`, 128 bytes
  de cabeçalho, 3 slots). Mexeu num, mexa no outro.
- **Registro em HKLM é obrigatório** e é o único passo que exige elevação — o instalador NSIS
  faz (`build/installer.nsh`), em dev é o `scripts/install-vcam.ps1`. Sem ele,
  `MFCreateVirtualCamera` devolve `REGDB_E_CLASSNOTREG` e o botão mostra o que fazer.
- **Câmera de sessão**: existe enquanto o sidecar viver. Fechar o app remove o dispositivo.

### Renderer (`src/`)

Quatro rotas em `HashRouter`: `/` (presets + controles), `/hall-map`, `/settings`, `/help`.

- **`src/context/BridgeProvider.tsx`** — estado compartilhado entre as telas: sidecar, enlace,
  configuração, status da sessão, canal, velocidade e câmera virtual. Fica **fora** do `Router`
  para a sessão não reiniciar a cada navegação. O estado da câmera virtual não é consultado em
  laço: o backend empurra o evento `vcam` ao ligar, desligar e ao entrar/sair do "sem sinal".
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

### Release e atualização automática

`scripts/release.ps1` (com `changelog.ps1` e `common.ps1`) publica da máquina local: tag,
changelog por tipo de commit, Release no GitHub e build com upload dos assets. Todas as etapas
são idempotentes — reexecutar com a mesma versão não duplica nada.

- **O upload tem que passar pelo `electron-builder --publish always`** (o script `release:publish`),
  não por `gh release upload`. É o electron-builder que gera e sobe o `latest.yml` e o `.blockmap`,
  e sem o `latest.yml` na release *latest* o `electron-updater` não enxerga versão nenhuma.
- **`EP_GH_IGNORE_TIME=true`** é definida em volta desse passo. Sem ela o electron-builder se
  recusa a subir assets numa release publicada há mais de 2 horas e **encerra com sucesso**,
  apenas logando um aviso — a republicação falharia em silêncio.
- **owner/repo saem do `repository` do package.json.** `generate-electron-builder.ts` monta o
  bloco `publish` a partir dele e o `common.ps1` lê o mesmo campo, então o script e o publisher
  não têm como divergir. O `electron-builder.json` é gerado e git-ignorado; não serve de fonte.
- **A verificação final baixa o `latest.yml` sem autenticação**, que é o que o app do usuário faz.
  Release em rascunho ou repositório privado dá 404 ali e o update não chega a ninguém.
- **`electron-updater` fica fora do bundle do main** (`externalize()` em `vite.config.ts`): ele
  carrega o updater da plataforma por `require` dinâmico. É um plugin com `resolveId` em vez de
  `build.rollupOptions.external` porque o vite-plugin-electron lê `rolldownOptions` no Vite 8 e
  `rollupOptions` no Vite 7, descartando em silêncio a chave que não corresponde à versão. Como
  é dependência de produção, o electron-builder o copia mesmo com o `files` restrito a `dist/**`.
- **`UpdateStatus` está duplicado** em `backend/updater.ts` e `src/types/index.ts` — mesmo contrato
  dos dois lados do preload, como acontece com `BridgeState`.
- **A atualização exige UAC.** O instalador é `perMachine` (registra a câmera virtual em HKLM), e
  `autoInstallOnAppQuit` está ligado para a DLL da câmera não ficar defasada em relação ao app.

`.github/workflows/deploy.yml` é um caminho antigo, disparado por push na branch `deploy` (que não
existe). Ele cria tags `vX.Y.Z-<run_number>` e não sobe `latest.yml` — se voltar a rodar, quebra a
cadeia de auto-update ao virar a release *latest*.

## Convenções

- **Português (pt-BR)** em comentários, documentação e textos de interface.
- Comentário explica **o porquê** (uma invariante, um contorno), não narra o código.
- `"type": "module"` — todo arquivo Node usa ESM.
