# SC - PTZ Control 🏗️

> App Electron para controlar câmeras PTZ de DVR/NVR Intelbras, feito para ajudar minha
> congregação de língua de sinais durante as reuniões.

---

<div align="center">
   <img alt="Version" src="https://img.shields.io/github/v/release/saulotarsobc/sc-ptz-control">
   <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow.svg">
   <img alt="Contributors" src="https://img.shields.io/github/contributors/saulotarsobc/sc-ptz-control">
   <img alt="Last Commit" src="https://img.shields.io/github/last-commit/saulotarsobc/sc-ptz-control">
   <img alt="Stars" src="https://img.shields.io/github/stars/saulotarsobc/sc-ptz-control">
</div>

---

![Alt text](./images/image.png)

## O que faz

- **Imagem ao vivo** do canal, com latência de aproximadamente um quadro
- **Controle PTZ completo**: cruzeta de 8 direções, zoom, foco, íris e velocidade 1–8
- **Presets** numerados com miniatura: ir, gravar a posição atual e excluir do equipamento
- **Captura automática** de miniaturas de todos os presets
- **Mapa do salão**: arrastar presets para as cadeiras do auditório
- **Câmera virtual** `SC PTZ Virtual Cam`: publica o canal ativo como uma webcam 720p para
  OBS, Meet, Teams etc. (Windows 11)

## Requisitos

- **Windows x64.** O NetSDK da Intelbras é nativo 64-bit e só existe para Windows.
- **.NET 8 SDK** para compilar o serviço em C# (o instalador já sai self-contained).
- **O SDK da Intelbras** (`NetSDK 3.050`), que não é versionado neste repositório.

O projeto espera estar dentro do monorepo `ls-brasil-monorepo`, onde existe a pasta `helpers/`
com o SDK. Fora dele, informe o caminho na hora de compilar:

```powershell
dotnet build native/PtzBridge -p:NetSdkRoot="C:\caminho\para\...190304"
```

O erro `NetSDK não encontrado` significa que o SDK está ausente, não que o código quebrou.

## Como rodar

```powershell
pnpm install
pnpm build:bridge   # compila o serviço C# (só na primeira vez ou quando ele mudar)
pnpm dev            # sobe o Vite + Electron; o serviço é iniciado automaticamente
```

Na primeira execução, vá em **Configurações** e informe IP, porta (**37777**, a do SDK — não a 80
da interface web), usuário, senha e canal. A senha é guardada cifrada pelo Windows (DPAPI).

### Câmera virtual (opcional, em desenvolvimento)

O botão **Ativar câmera virtual** exige um componente nativo registrado no Windows. Em
desenvolvimento isso é feito uma única vez — o instalador cuida disso para o usuário final:

```powershell
pnpm build:vcam                  # compila native/ScPtzVCam (CMake + toolset C++ do VS)
pnpm install:vcam                # registra em HKLM — precisa de um terminal ADMINISTRADOR
```

Sem imagem do NVR a câmera transmite um quadro preto com "Sem sinal!", em vez de sumir da
lista de dispositivos. Para desfazer: `scripts/uninstall-vcam.ps1`.

## Como gerar o instalador

```powershell
pnpm dist   # -> out/
```

## Como publicar uma versão

O app se atualiza sozinho: ao abrir, ele consulta os Releases deste repositório, baixa a versão
nova em segundo plano e mostra uma faixa no rodapé quando o instalador está pronto.

Publicar é um comando só, rodado da máquina de desenvolvimento:

```powershell
pnpm release          # publica a versão que está no package.json
pnpm release:dry      # simula tudo, sem criar tag nem release
pnpm release:notes    # só mostra o changelog que seria usado

# Para subir a versão junto, chame o script direto — o pnpm não repassa
# flags de traço simples:
pwsh .\scripts\release.ps1 -Bump patch
```

O `release.ps1` faz, em ordem: checa o ambiente, resolve a versão, roda o `tsc --noEmit`, envia os
commits pendentes, cria e empurra a tag `vX.Y.Z`, monta o changelog a partir dos commits, cria a
Release no GitHub e roda o `pnpm dist` publicando os assets. No fim ele baixa o `latest.yml`
publicado **sem autenticação** — que é exatamente o que o app do usuário faz — para provar que a
cadeia de atualização está de pé.

Todas as etapas são idempotentes: rodar de novo com a mesma versão não duplica tag nem release,
e os assets são substituídos.

**Antes da primeira vez**, autentique o GitHub CLI com `gh auth login`. O script também aceita a
variável `GH_TOKEN` ou um arquivo `electron-builder.env` (veja `electron-builder.env.example`);
o token precisa do escopo `repo`.

A máquina que publica precisa de tudo que o `pnpm dist` precisa: .NET 8 SDK, CMake + toolset C++
e o NetSDK da Intelbras. A atualização instalada roda o NSIS com elevação — o instalador é
`perMachine` porque registra a câmera virtual em HKLM —, então o Windows pede confirmação do UAC.

## Arquitetura

O app fala com o NVR pelo **protocolo privado Dahua/Intelbras via NetSDK nativo**, não pela API
HTTP CGI. É o que permite PTZ com velocidade em todos os eixos e vídeo H.264 decodificado
localmente — coisas que o CGI não entrega.

```
Electron main ──spawn──► PtzBridge.exe (C# / .NET 8 / NetSDK)
                          │  escuta em 127.0.0.1, protegido por token
                          ├─ /ws/control          comandos e eventos (JSON)
                          ├─ /ws/video?channel=N  frames NV12 (binário)
                          ├─ /api/thumb/{ch}/{n}  miniaturas dos presets
                          └─ câmera virtual ──► %ProgramData%\ScPtzControl\vcam-frames.bin
                                    ▲                        │
                       React 19 + Mantine 9 (renderer)       ▼
                                                    ScPtzVCam.dll no Frame Server
                                                    ("SC PTZ Virtual Cam")
```

O serviço em C# é o único que fala com o equipamento e é o dono da configuração e das
miniaturas (`%APPDATA%/sc-ptz-control`). O renderer não tem acesso à rede do NVR.

Detalhes de implementação estão em [CLAUDE.md](./CLAUDE.md).

## Help

- [@saulotarsobc](https://github.com/saulotarsobc)
  - [Template - SC Electron Boilerplate](https://github.com/saulotarsobc/sc-electron-boilerplate)
- [Intelbras](https://www.intelbras.com/pt-br/)
  - NetSDK 3.050 / PlaySDK 3.042 (SDK nativo — é o que o app usa)
  - HTTP_API_V3.35_Intelbras (a API antiga, não é mais usada)
  - [URL RTSP - Intelbras Forum](https://forum.intelbras.com.br/viewtopic.php?t=56068)
