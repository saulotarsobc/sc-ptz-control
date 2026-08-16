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
  OBS, Meet, Teams etc. (Windows 11 ou Linux com v4l2loopback)

## Requisitos

- **Windows x64 ou Linux x64** (Ubuntu 24.04 e derivados são suportados).
- **.NET 8 SDK** e Node 22.12+ para desenvolvimento; o pacote instalado leva o serviço .NET
  self-contained.
- **Windows:** o SDK Intelbras (`NetSDK 3.050`) preserva o protocolo nativo original.
- **Linux:** `ffmpeg` é obrigatório; o app usa RTSP para vídeo e CGI Digest para PTZ, sem SDK
  proprietário. Instale com `sudo apt install ffmpeg`.

O NetSDK é opcional. Quando a pasta `helpers/` estiver presente, o build também inclui o backend
nativo (preferido no Windows). Sem ela, o bridge continua compilando com RTSP + CGI. Fora do
monorepo, informe o caminho do SDK ao compilar:

```powershell
dotnet build native/PtzBridge -p:NetSdkRoot="C:\caminho\para\...190304"
```

No Linux, deixe **Transporte** como **Automático** (ou selecione **RTSP + CGI**) nas
configurações. As portas padrão são HTTP CGI `80` e RTSP `554`.

## Como rodar

```bash
pnpm install
pnpm build:bridge   # compila o serviço C# (só na primeira vez ou quando ele mudar)
pnpm dev            # sobe o Vite + Electron; o serviço é iniciado automaticamente
```

Na primeira execução, vá em **Configurações** e informe IP, usuário, senha e canal. No Windows o
modo automático usa a porta SDK **37777**; no Linux ele usa HTTP CGI **80** e RTSP **554**. A senha
fica cifrada pelo sistema: DPAPI no Windows e AES-GCM com chave de arquivo `0600` no Linux.

### Câmera virtual (opcional)

O botão **Câmera virtual** exige um componente nativo registrado no Windows. Em
desenvolvimento isso é feito uma única vez — o instalador cuida disso para o usuário final:

```powershell
pnpm build:vcam                  # compila native/ScPtzVCam (CMake + toolset C++ do VS)
pnpm install:vcam                # registra em HKLM — precisa de um terminal ADMINISTRADOR
```

Sem imagem do NVR a câmera transmite um quadro preto com "Sem sinal!", em vez de sumir da
lista de dispositivos. Para desfazer: `scripts/uninstall-vcam.ps1`.

No Linux, instale uma vez o módulo de loopback e crie o dispositivo:

```bash
sudo apt install ffmpeg v4l2loopback-dkms v4l2loopback-utils
sudo modprobe v4l2loopback devices=1 video_nr=10 card_label="SC PTZ Virtual Cam" exclusive_caps=1
v4l2-ctl --list-devices
```

Depois ligue o botão **Câmera virtual** no app. Se ele não encontrar o dispositivo, informe o
caminho (por exemplo, `/dev/video10`) nas Configurações. Se o dispositivo existir mas o app
receber “permissão negada”, adicione o usuário ao grupo `video` com
`sudo usermod -aG video "$USER"` e encerre/inicie a sessão do Ubuntu.

## Como gerar o instalador

```bash
pnpm dist         # gera o instalador adequado ao SO corrente em out/
pnpm dist:linux   # no Linux: AppImage e .deb em out/
```

Um AppImage pode ser executado com `chmod +x arquivo.AppImage && ./arquivo.AppImage`. No Ubuntu,
instale o `.deb` com `sudo apt install ./arquivo.deb`.

### Windows: bloqueio do Smart App Control

As versões atuais para Windows são gratuitas e distribuídas sem assinatura Authenticode. Isso não
é uma licença do aplicativo: assinatura de código serve apenas para o Windows confirmar a identidade
do publicador. Em computadores com o **Smart App Control** ativado, uma versão nova pode ser
bloqueada por ainda não possuir reputação, mesmo que uma versão anterior funcione normalmente. O
Windows costuma mostrar a mensagem **“Uma política de Controle de Aplicativo bloqueou este
arquivo”**. O mesmo bloqueio pode atingir o instalador baixado pelo atualizador automático.

Não há uma exceção por aplicativo no Smart App Control. Executar como administrador, renomear o
arquivo, usar `Unblock-File` ou iniciar pelo PowerShell não contorna essa política. Se o instalador
foi obtido da página oficial de Releases deste repositório e você confia no arquivo, o contorno sem
certificado pago é desativar temporariamente o recurso:

1. Abra **Segurança do Windows**.
2. Entre em **Controle de aplicativos e navegador**.
3. Abra **Configurações do Controle Inteligente de Aplicativos**.
4. Selecione **Desativado** e confirme o aviso do Windows.
5. Execute novamente o instalador ou mande o aplicativo procurar a atualização.

Desativar o recurso reduz a proteção contra aplicativos desconhecidos. Em versões recentes do
Windows ele pode ser reativado depois da instalação pela mesma tela; ao reativá-lo, componentes
ainda sem reputação também podem voltar a ser bloqueados. Em uma máquina usada para desenvolver e
testar builds locais frequentes, mantenha esse risco em mente ou use uma VM dedicada.

Para confirmar o diagnóstico, consulte
`Logs de Aplicativos e Serviços > Microsoft > Windows > CodeIntegrity > Operational` no
Visualizador de Eventos. Um bloqueio do Smart App Control aparece normalmente como evento `3077`,
com a política `VerifiedAndReputableDesktop`. Consulte também a
[documentação oficial do Smart App Control](https://support.microsoft.com/en-US/Windows/Security/Threat-Malware-Protection/smart-app-control-frequently-asked-questions).

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

No Windows o app prefere o **NetSDK Dahua/Intelbras** (protocolo privado na porta 37777). Em
qualquer Linux e quando o SDK não estiver disponível, ele usa o fallback padrão **RTSP + CGI**:
FFmpeg decodifica o vídeo e o CGI autenticado envia os comandos PTZ. O renderer e o protocolo
WebSocket local são os mesmos nos dois casos.

```
Electron main ──spawn──► PtzBridge(.exe) (C# / .NET 8)
                          │  escuta em 127.0.0.1, protegido por token
                          ├─ /ws/control          comandos e eventos (JSON)
                          ├─ /ws/video?channel=N  frames NV12 (binário)
                          ├─ /api/thumb/{ch}/{n}  miniaturas dos presets
                          └─ câmera virtual ──► Media Foundation/MMF (Windows)
                                               ou v4l2loopback (Linux)
```

O serviço em C# é o único que fala com o equipamento e é o dono da configuração e das
miniaturas (`%APPDATA%/sc-ptz-control`). O renderer não tem acesso à rede do NVR.

Detalhes de implementação estão em [CLAUDE.md](./CLAUDE.md).

## Instalação do v4l2loopback no Linux

```bash
sudo apt update
sudo apt install -y ffmpeg v4l2loopback-dkms v4l2loopback-utils

sudo modprobe v4l2loopback \
  devices=1 \
  video_nr=10 \
  card_label="SC PTZ Virtual Cam" \
  exclusive_caps=1

v4l2-ctl --list-devices
ls -l /dev/video10
```

## Help

- [@saulotarsobc](https://github.com/saulotarsobc)
  - [Template - SC Electron Boilerplate](https://github.com/saulotarsobc/sc-electron-boilerplate)
- [Intelbras](https://www.intelbras.com/pt-br/)
  - NetSDK 3.050 / PlaySDK 3.042 (SDK nativo — é o que o app usa)
  - HTTP_API_V3.35_Intelbras (a API antiga, não é mais usada)
  - [URL RTSP - Intelbras Forum](https://forum.intelbras.com.br/viewtopic.php?t=56068)
