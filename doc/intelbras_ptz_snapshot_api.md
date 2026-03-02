# 📹 Intelbras HTTP API — Controle PTZ e Snapshot

> **Fonte:** HTTP API V3.59 Intelbras  
> **Protocolo:** HTTP GET (maioria dos endpoints)  
> **Autenticação:** HTTP Digest Authentication  
> **Base URL:** `http://<IP_DO_DISPOSITIVO>/cgi-bin/`

---

## 📑 Índice

1. [Autenticação](#1-autenticação)
2. [Controle PTZ](#2-controle-ptz)
   - [Configuração PTZ](#21-configuração-ptz)
   - [Lista de Protocolos PTZ](#22-lista-de-protocolos-ptz)
   - [Capacidades do Protocolo PTZ](#23-capacidades-do-protocolo-ptz)
   - [Status do PTZ](#24-status-do-ptz)
   - [Movimentação Básica (Start/Stop)](#25-movimentação-básica-startstop)
   - [Movimentação Contínua](#26-movimentação-contínua)
   - [Posicionamento 3D](#27-posicionamento-3d)
   - [Movimento Relativo](#28-movimento-relativo)
   - [Posicionamento Absoluto](#29-posicionamento-absoluto)
   - [Presets (Posições Pré-definidas)](#210-presets-posições-pré-definidas)
   - [Tour (Ronda)](#211-tour-ronda)
   - [Scan (Varredura)](#212-scan-varredura)
   - [Pattern (Padrão de Movimento)](#213-pattern-padrão-de-movimento)
   - [Pan Automático](#214-pan-automático)
   - [Movimento Automático PTZ](#215-movimento-automático-ptz)
   - [Reiniciar / Resetar PTZ](#216-reiniciar--resetar-ptz)
   - [Menu OSD](#217-menu-osd)
3. [Snapshot (Captura de Imagem)](#3-snapshot-captura-de-imagem)
   - [Configuração de Snapshot](#31-configuração-de-snapshot)
   - [Capturar Snapshot](#32-capturar-snapshot)
   - [Inscrição em Snapshots de Eventos](#33-inscrição-em-snapshots-de-eventos)
4. [Exemplos Práticos com cURL](#4-exemplos-práticos-com-curl)

---

## 1. Autenticação

Todas as requisições à API requerem autenticação via **HTTP Digest Authentication**. Utilize usuário e senha configurados no dispositivo.

```
http://usuario:senha@<IP>/cgi-bin/...
```

Ou via cabeçalho `Authorization: Digest ...` conforme RFC 2617.

---

## 2. Controle PTZ

### 2.1 Configuração PTZ

Obter e definir a configuração do PTZ do dispositivo.

#### Obter Configuração

```
GET http://<IP>/cgi-bin/configManager.cgi?action=getConfig&name=Ptz
```

**Resposta exemplo:**

```
table.Ptz[0].Address=8
table.Ptz[0].Attribute[0]=115200
table.Ptz[0].Attribute[1]=8
table.Ptz[0].Attribute[2]=Even
table.Ptz[0].Attribute[3]=1
table.Ptz[0].Homing[0]=0
table.Ptz[0].Homing[1]=30
table.Ptz[0].ProtocolName=DH_SD1
```

#### Definir Configuração

```
GET http://<IP>/cgi-bin/configManager.cgi?action=setConfig&Ptz[0].Address=8&Ptz[0].Attribute[0]=9600
```

#### Parâmetros de Configuração

| Parâmetro          | Tipo     | Descrição                                                               | Exemplo                    |
| ------------------ | -------- | ----------------------------------------------------------------------- | -------------------------- |
| `ProtocolName`     | char[32] | Nome do protocolo PTZ (ver `getProtocolList`)                           | `"DH_SD1"`                 |
| `Address`          | int      | Endereço do dispositivo [0–255]                                         | `8`                        |
| `Attribute`        | array    | Propriedades da porta serial: [baud rate, data bit, paridade, stop bit] | `[115200, 8, "Even", "1"]` |
| `ControlPriority`  | enum     | Prioridade de controle: `"RS485"` ou `"Net"`                            | `"Net"`                    |
| `ControlDelayTime` | uint     | Tempo de atraso do controle PTZ (segundos)                              | `10`                       |
| `Homing`           | int[2]   | [preset para homing automático, tempo em segundos]                      | `[0, 30]`                  |

> [!NOTE]
>
> - **Baud rates válidos:** 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200
> - **Data bits válidos:** 4, 5, 6, 7, 8
> - **Paridade:** Even, Mark, None, Odd, Space
> - **Stop bits:** 1, 1.5, 2

---

### 2.2 Lista de Protocolos PTZ

Retorna a lista de protocolos PTZ suportados pelo dispositivo.

```
GET http://<IP>/cgi-bin/ptz.cgi?action=getProtocolList&channel=1
```

**Resposta exemplo:**

```
info.RS[0]=Pelco
info.RS[1]=DH-SD1
info.Coaxial[0]=HD-CVI
info.Coaxial[1]=HD-CVI2.0
```

| Campo          | Descrição                           |
| -------------- | ----------------------------------- |
| `info.RS`      | Lista de protocolos PTZ via RS485   |
| `info.Coaxial` | Lista de protocolos PTZ via coaxial |

---

### 2.3 Capacidades do Protocolo PTZ

Retorna as capacidades do protocolo PTZ atual.

```
GET http://<IP>/cgi-bin/ptz.cgi?action=getCurrentProtocolCaps&channel=1
```

**Resposta exemplo:**

```
caps.Pan=false
caps.Tile=false
caps.Zoom=false
caps.Focus=false
caps.Iris=false
caps.Flip=false
caps.Menu=false
caps.PresetMin=1
caps.PresetMax=80
caps.TourMin=0
caps.TourMax=7
caps.PatternMin=1
caps.PatternMax=5
caps.PanSpeedMin=1
caps.PanSpeedMax=255
caps.TileSpeedMin=1
caps.TileSpeedMax=255
caps.PtzMotionRange.HorizontalAngle[0]=0
caps.PtzMotionRange.HorizontalAngle[1]=360
caps.PtzMotionRange.VerticalAngle[0]=-20
caps.PtzMotionRange.VerticalAngle[1]=90
caps.ZoomMin=1
caps.ZoomMax=30
```

> [!IMPORTANT]
> Sempre verifique as capacidades antes de enviar comandos PTZ. Se `caps.Pan=false`, o dispositivo **não suporta** movimentação horizontal via esse protocolo.

---

### 2.4 Status do PTZ

Consulta o status atual do PTZ (posição, movimento, zoom).

```
GET http://<IP>/cgi-bin/ptz.cgi?action=getStatus&channel=1
```

**Resposta exemplo:**

```
status.MoveStatus=Idle
status.ZoomStatus=Idle
status.PresetID=10
status.Position[0]=312.0
status.Position[1]=16.5
status.Position[2]=5.8
```

| Campo         | Tipo   | Descrição                            |
| ------------- | ------ | ------------------------------------ |
| `MoveStatus`  | string | `"Idle"`, `"Moving"` ou `"Unknown"`  |
| `ZoomStatus`  | string | `"Idle"`, `"Zooming"` ou `"Unknown"` |
| `PresetID`    | int    | ID do preset atual                   |
| `Position[0]` | double | Ângulo horizontal (0.0 ~ 360.0)      |
| `Position[1]` | double | Ângulo vertical (-180.0 ~ 180.0)     |
| `Position[2]` | double | Magnificação/Zoom (0.0 ~ 128.0)      |

---

### 2.5 Movimentação Básica (Start/Stop)

#### ▶ Iniciar Movimento

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=<CÓDIGO>&arg1=0&arg2=<VELOCIDADE>&arg3=0
```

#### ⏹ Parar Movimento

```
GET http://<IP>/cgi-bin/ptz.cgi?action=stop&channel=1&code=<CÓDIGO>&arg1=0&arg2=0&arg3=0
```

#### Códigos de Operação

| Código      | Descrição                        | arg1                      | arg2                        | arg3 |
| ----------- | -------------------------------- | ------------------------- | --------------------------- | ---- |
| `Up`        | Mover para cima                  | 0                         | Velocidade vertical [1–8]   | 0    |
| `Down`      | Mover para baixo                 | 0                         | Velocidade vertical [1–8]   | 0    |
| `Left`      | Mover para esquerda              | 0                         | Velocidade horizontal [1–8] | 0    |
| `Right`     | Mover para direita               | 0                         | Velocidade horizontal [1–8] | 0    |
| `LeftUp`    | Mover diagonal superior-esquerda | Velocidade vertical [1–8] | Velocidade horizontal [1–8] | 0    |
| `RightUp`   | Mover diagonal superior-direita  | Velocidade vertical [1–8] | Velocidade horizontal [1–8] | 0    |
| `LeftDown`  | Mover diagonal inferior-esquerda | Velocidade vertical [1–8] | Velocidade horizontal [1–8] | 0    |
| `RightDown` | Mover diagonal inferior-direita  | Velocidade vertical [1–8] | Velocidade horizontal [1–8] | 0    |
| `ZoomWide`  | Zoom In (ampliar)                | 0                         | 0                           | 0    |
| `ZoomTele`  | Zoom Out (reduzir)               | 0                         | 0                           | 0    |
| `FocusNear` | Foco próximo                     | 0                         | 0                           | 0    |
| `FocusFar`  | Foco distante                    | 0                         | 0                           | 0    |
| `IrisLarge` | Aumentar abertura                | 0                         | 0                           | 0    |
| `IrisSmall` | Diminuir abertura                | 0                         | 0                           | 0    |

**Exemplos:**

```bash
# Mover para cima com velocidade 5
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=Up&arg1=0&arg2=5&arg3=0

# Parar movimento
GET http://<IP>/cgi-bin/ptz.cgi?action=stop&channel=1&code=Up&arg1=0&arg2=0&arg3=0

# Zoom In
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=ZoomWide&arg1=0&arg2=0&arg3=0
```

> [!TIP]
> O movimento continua até que um comando `stop` seja enviado com o mesmo código. Sempre envie o `stop` correspondente para evitar que a câmera fique se movendo indefinidamente.

---

### 2.6 Movimentação Contínua

Movimento contínuo com controle de velocidade, direção e tempo de expiração.

#### ▶ Iniciar Movimento Contínuo

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=Continuously&channel=1&arg1=<X>&arg2=<Y>&arg3=<ZOOM>&arg4=<TIMEOUT>
```

| Parâmetro | Tipo | Descrição                                                                  |
| --------- | ---- | -------------------------------------------------------------------------- |
| `arg1`    | int  | Velocidade horizontal [-100, 100]. Negativo = esquerda, positivo = direita |
| `arg2`    | int  | Velocidade vertical [-100, 100]. Positivo = cima, negativo = baixo         |
| `arg3`    | int  | Velocidade de zoom [-100, 100]                                             |
| `arg4`    | int  | Tempo máximo em segundos (máx 3600). Auto-para ao expirar                  |

#### Direções com base em arg1 e arg2

| Direção           | arg1 | arg2 |
| ----------------- | ---- | ---- |
| Esquerda          | < -4 | 0    |
| Direita           | > 4  | 0    |
| Cima              | 0    | > 4  |
| Baixo             | 0    | < -4 |
| Superior-esquerda | < -4 | > 4  |
| Superior-direita  | > 4  | > 4  |
| Inferior-esquerda | < -4 | < -4 |
| Inferior-direita  | > 4  | < -4 |

#### ⏹ Parar Movimento Contínuo

```
GET http://<IP>/cgi-bin/ptz.cgi?action=stop&code=Continuously&channel=1&arg1=0&arg2=0&arg3=0&arg4=0
```

**Exemplo:**

```bash
# Mover para direita e para cima com zoom, timeout de 60s
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=Continuously&channel=1&arg1=50&arg2=50&arg3=10&arg4=60
```

---

### 2.7 Posicionamento 3D

Move o PTZ para uma posição específica na tela usando coordenadas normalizadas (0–8192).

```
GET http://<IP>/cgi-bin/ptzBase.cgi?action=moveDirectly&channel=1&startPoint[0]=<X1>&startPoint[1]=<Y1>&endPoint[0]=<X2>&endPoint[1]=<Y2>
```

| Parâmetro    | Tipo   | Descrição                                    |
| ------------ | ------ | -------------------------------------------- |
| `startPoint` | int[2] | Ponto inicial [X, Y] normalizado de 0 a 8192 |
| `endPoint`   | int[2] | Ponto final [X, Y] normalizado de 0 a 8192   |

**Exemplo:**

```bash
GET http://<IP>/cgi-bin/ptzBase.cgi?action=moveDirectly&channel=1&startPoint[0]=7253&startPoint[1]=2275&endPoint[0]=7893&endPoint[1]=3034
```

> [!NOTE]
> O ponto inicial e final definem um retângulo na tela. A câmera ajustará zoom e posição para enquadrar essa área.

---

### 2.8 Movimento Relativo

Move o PTZ relativamente à posição atual.

```
GET http://<IP>/cgi-bin/ptz.cgi?action=moveRelatively&channel=1&arg1=<H>&arg2=<V>&arg3=<Z>
```

| Parâmetro | Range   | Descrição                     |
| --------- | ------- | ----------------------------- |
| `arg1`    | [-1, 1] | Movimento horizontal relativo |
| `arg2`    | [-1, 1] | Movimento vertical relativo   |
| `arg3`    | [-1, 1] | Zoom relativo                 |

**Exemplo:**

```bash
# Mover 10% para direita, 10% para cima, zoom 50%
GET http://<IP>/cgi-bin/ptz.cgi?action=moveRelatively&channel=1&arg1=0.1&arg2=0.1&arg3=0.5
```

---

### 2.9 Posicionamento Absoluto

Move o PTZ para uma posição absoluta. Verificar capacidades com `getCurrentProtocolCaps` antes.

```
GET http://<IP>/cgi-bin/ptz.cgi?action=moveAbsolutely&channel=1&arg1=<H>&arg2=<V>&arg3=<Z>
```

| Parâmetro | Range   | Fórmula do ângulo                                                                                    |
| --------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `arg1`    | [-1, 1] | Se arg1 < 0: Ângulo = 180 × arg1 + 360 → [180°, 360°]. Se arg1 ≥ 0: Ângulo = 180 × arg1 → [0°, 180°] |
| `arg2`    | [-1, 1] | Ângulo = -180 × arg2 → [-180°, 180°]                                                                 |
| `arg3`    | [-1, 1] | Zoom absoluto normalizado                                                                            |

**Exemplo:**

```bash
GET http://<IP>/cgi-bin/ptz.cgi?action=moveAbsolutely&channel=1&arg1=-0.8&arg2=0.3&arg3=0.5
```

---

### 2.10 Presets (Posições Pré-definidas)

#### Listar Presets

```
GET http://<IP>/cgi-bin/ptz.cgi?action=getPresets&channel=1
```

**Resposta exemplo:**

```
presets[0].Index=1
presets[0].Name=Preset 1
presets[0].Type=0
presets[0].Position=[900, -900, 5]
```

| Campo         | Descrição                                      |
| ------------- | ---------------------------------------------- |
| `Index`       | Número do preset (a partir de 1)               |
| `Name`        | Nome do preset                                 |
| `Type`        | 0 = Normal, 1 = Com regras smart, 2 = Especial |
| `Position[0]` | Coordenada horizontal [0–3599] (graus × 10)    |
| `Position[1]` | Coordenada vertical [-1800–1800] (graus × 10)  |
| `Position[2]` | Zoom [0–128]                                   |

#### Ir para Preset

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=GotoPreset&channel=1&arg1=0&arg2=<NUMERO_PRESET>&arg3=0
```

**Exemplo:** Ir para o preset 1:

```bash
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=GotoPreset&channel=1&arg1=0&arg2=1&arg3=0
```

#### Salvar Preset (posição atual)

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=SetPreset&channel=1&arg1=0&arg2=<NUMERO_PRESET>&arg3=0
```

#### Renomear Preset

```
GET http://<IP>/cgi-bin/ptz.cgi?action=setPreset&channel=1&arg1=<NUMERO_PRESET>&arg2=<NOME>
```

**Exemplo:**

```bash
GET http://<IP>/cgi-bin/ptz.cgi?action=setPreset&channel=1&arg1=2&arg2=Entrada_Principal
```

#### Deletar Preset

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=ClearPreset&channel=1&arg1=0&arg2=<NUMERO_PRESET>&arg3=0
```

---

### 2.11 Tour (Ronda)

Permite criar rondas automáticas percorrendo presets configurados.

#### Iniciar Tour

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=StartTour&channel=1&arg1=<NUMERO_ROTA>&arg2=0&arg3=0
```

#### Parar Tour

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=StopTour&channel=1&arg1=<NUMERO_ROTA>&arg2=0&arg3=0
```

#### Criar Grupo de Tour

```
GET http://<IP>/cgi-bin/ptz.cgi?action=setTour&channel=1&arg1=<NUMERO_ROTA>&arg2=<NOME>
```

#### Deletar Grupo de Tour

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=ClearTour&channel=1&arg1=<NUMERO_GRUPO>&arg2=0&arg3=0
```

#### Adicionar Preset ao Tour

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=AddTour&channel=1&arg1=<NUMERO_ROTA>&arg2=<NUMERO_PRESET>&arg3=0
```

#### Remover Preset do Tour

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=DelTour&channel=1&arg1=<NUMERO_ROTA>&arg2=<NUMERO_PRESET>&arg3=0
```

---

### 2.12 Scan (Varredura)

Varredura horizontal automática entre limites configurados.

#### Definir Limite Esquerdo

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=SetLeftLimit&channel=1&arg1=<NUMERO_SCAN>&arg2=0&arg3=0
```

#### Definir Limite Direito

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=SetRightLimit&channel=1&arg1=<NUMERO_SCAN>&arg2=0&arg3=0
```

#### Iniciar Scan

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=AutoScanOn&channel=1&arg1=<NUMERO_SCAN>&arg2=0&arg3=0
```

#### Parar Scan

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&code=AutoScanOff&channel=1&arg1=<NUMERO_SCAN>&arg2=0&arg3=0
```

> [!TIP]
> Para configurar o scan: primeiro mova a câmera para a posição desejada e defina o limite esquerdo, depois mova para outra posição e defina o limite direito. Após isso, inicie o scan.

---

### 2.13 Pattern (Padrão de Movimento)

Grava e reproduz um padrão de movimento do PTZ.

#### Iniciar Gravação de Pattern

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=SetPatternBegin&arg1=<NUMERO_PATTERN>&arg2=0&arg3=0
```

#### Parar Gravação de Pattern

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=SetPatternEnd&arg1=<NUMERO_PATTERN>&arg2=0&arg3=0
```

#### Reproduzir Pattern

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=StartPattern&arg1=<NUMERO_PATTERN>&arg2=0&arg3=0
```

#### Parar Reprodução de Pattern

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=StopPattern&arg1=<NUMERO_PATTERN>&arg2=0&arg3=0
```

> [!NOTE]
> Para criar um pattern: inicie a gravação, mova a câmera manualmente (Up, Down, Zoom, etc.), e finalize a gravação. Ao reproduzir, a câmera repetirá exatamente os mesmos movimentos automaticamente.

---

### 2.14 Pan Automático

Rotação horizontal contínua (360°).

#### Iniciar Pan Automático

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=AutoPanOn&arg1=0&arg2=0&arg3=0
```

#### Parar Pan Automático

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=AutoPanOff&arg1=0&arg2=0&arg3=0
```

---

### 2.15 Movimento Automático PTZ

Configuração de tarefas automáticas do PTZ (agendamento de presets, scans, tours, patterns).

#### Obter Configuração

```
GET http://<IP>/cgi-bin/configManager.cgi?action=getConfig&name=PtzAutoMovement
```

#### Definir Configuração

```
GET http://<IP>/cgi-bin/configManager.cgi?action=setConfig&PtzAutoMovement[0][0].Function=Preset&PtzAutoMovement[0][0].PresetId=1
```

| Parâmetro           | Tipo  | Descrição                                                  |
| ------------------- | ----- | ---------------------------------------------------------- |
| `Enable`            | bool  | Habilitar/Desabilitar                                      |
| `Function`          | enum  | `"Scan"`, `"Preset"`, `"Pattern"`, `"Tour"`, `"None"`      |
| `ScanId`            | int   | ID do scan (a partir de 1)                                 |
| `PresetId`          | int   | ID do preset (a partir de 1)                               |
| `PatternId`         | int   | ID do pattern (a partir de 1)                              |
| `TourId`            | int   | ID do tour (a partir de 1)                                 |
| `AutoHoming.Enable` | bool  | Habilitar auto-retorno à posição inicial                   |
| `AutoHoming.Time`   | uint  | Tempo para retorno automático (segundos)                   |
| `SnapshotEnable`    | bool  | Habilitar snapshot ao chegar no preset                     |
| `SnapshotDelayTime` | int   | Tempo de atraso para snapshot (segundos)                   |
| `TimeSection`       | array | Agendamento semanal (domingo=0 a sábado=6, até 6 períodos) |

---

### 2.16 Reiniciar / Resetar PTZ

#### Reiniciar PTZ

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=Restart&arg1=0&arg2=0&arg3=0
```

#### Resetar PTZ (voltar ao padrão de fábrica)

```
GET http://<IP>/cgi-bin/ptz.cgi?action=start&channel=1&code=Reset&arg1=0&arg2=0&arg3=0
```

> [!CAUTION]
> O comando `Reset` restaura o PTZ para as configurações de fábrica. Utilize com cuidado!

---

### 2.17 Menu OSD

Controle do menu OSD (On-Screen Display) do PTZ.

| Ação                  | URL                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| **Abrir menu**        | `GET .../ptz.cgi?action=start&channel=1&code=Menu&arg1=0&arg2=0&arg3=0`  |
| **Sair do menu**      | `GET .../ptz.cgi?action=start&channel=1&code=Exit&arg1=0&arg2=0&arg3=0`  |
| **Confirmar (Enter)** | `GET .../ptz.cgi?action=start&channel=1&code=Enter&arg1=0&arg2=0&arg3=0` |

Para navegar no menu, use os comandos de movimentação básica (`Up`, `Down`, `Left`, `Right`).

---

## 3. Snapshot (Captura de Imagem)

### 3.1 Configuração de Snapshot

Gerencia agendamento e tipo de snapshot por canal.

#### Obter Configuração

```
GET http://<IP>/cgi-bin/configManager.cgi?action=getConfig&name=Snap
```

**Resposta exemplo:**

```
table.Snap[0].HolidayEnable=true
table.Snap[0].TimeSection[0][0]=6 00:00:00-23:59:59
table.Snap[0].TimeSection[0][1]=0 00:00:00-23:59:59
```

#### Definir Configuração

```
GET http://<IP>/cgi-bin/configManager.cgi?action=setConfig&Snap[0].HolidayEnable=true&Snap[0].TimeSection[0][0]=6 00:00:00-23:59:59
```

#### Parâmetros

| Parâmetro                      | Tipo   | Descrição                           |
| ------------------------------ | ------ | ----------------------------------- |
| `HolidayEnable`                | bool   | Habilitar configuração de feriado   |
| `TimeSection[semana][período]` | string | Formato: `"mask HH:MM:SS-HH:MM:SS"` |

#### Máscara (Mask) do TimeSection

A máscara é um valor inteiro onde cada bit indica um tipo de snapshot:

| Bit   | Tipo                               |
| ----- | ---------------------------------- |
| Bit 0 | Snapshot normal                    |
| Bit 1 | Snapshot por detecção de movimento |
| Bit 2 | Snapshot por alarme                |
| Bit 3 | Snapshot por cartão                |
| Bit 6 | Snapshot POS                       |

**Exemplos de máscara:**

- `1` = Apenas snapshot normal
- `2` = Apenas motion detection
- `6` = Motion detection + Alarme (bits 1 e 2)
- `7` = Normal + Motion + Alarme (bits 0, 1 e 2)

---

### 3.2 Capturar Snapshot

> [!IMPORTANT]
> Este é o endpoint principal para obter uma imagem instantânea da câmera.

```
GET http://<IP>/cgi-bin/snapshot.cgi?channel=1&type=0
```

| Parâmetro | Tipo   | Obrigatório | Descrição                                                                                         |
| --------- | ------ | ----------- | ------------------------------------------------------------------------------------------------- |
| `channel` | int    | Não         | Canal de vídeo (a partir de 1, padrão: 1)                                                         |
| `type`    | uint32 | Não         | `0` = Snapshot do front-end (câmera). `1` = Captura local com decodificação secundária. Padrão: 0 |

**Resposta:**

```
HTTP/1.1 200 OK
Server: Device/1.0
Content-Type: image/jpeg
Content-Length: <tamanho_da_imagem>

<dados binários JPEG>
```

> [!TIP]
> A resposta retorna diretamente os **bytes da imagem JPEG**. Basta salvar o corpo da resposta como arquivo `.jpg`.

---

### 3.3 Inscrição em Snapshots de Eventos

Inscreve-se para receber snapshots automaticamente quando eventos ocorrerem.

```
GET http://<IP>/cgi-bin/snapManager.cgi?action=attachFileProc&channel=1&heartbeat=5&Flags[0]=Event&Events=[VideoMotion,VideoBlind,VideoLoss]
```

| Parâmetro   | Tipo  | Descrição                                             |
| ----------- | ----- | ----------------------------------------------------- |
| `channel`   | int   | Canal de vídeo (1 = canal 1, -1 = todos)              |
| `heartbeat` | int   | Intervalo de heartbeat em segundos [1–60] (padrão: 5) |
| `Flags`     | array | Deve incluir `"Event"`                                |
| `Events`    | array | Lista de eventos para inscrição                       |

#### Eventos Comuns Disponíveis

| Código do Evento    | Descrição                       |
| ------------------- | ------------------------------- |
| `VideoMotion`       | Detecção de movimento           |
| `VideoLoss`         | Perda de vídeo                  |
| `VideoBlind`        | Tamponamento de vídeo           |
| `AlarmLocal`        | Alarme local                    |
| `TrafficJunction`   | ANPR (reconhecimento de placas) |
| `FaceRecognition`   | Reconhecimento facial           |
| `AccessControl`     | Controle de acesso              |
| `TrafficManualSnap` | Captura manual                  |
| `All`               | Todos os eventos                |

**Resposta:** Stream multipart contínuo com eventos e snapshots.

```
Content-Type: multipart/x-mixed-replace; boundary=<boundary>

--<boundary>
Content-Type: text/plain
Content-Length: <size>

Events[0].EventBaseInfo.Code=VideoMotion
Events[0].EventBaseInfo.Action=Start
Events[0].EventBaseInfo.Index=0
Events[0].Channel=0

--<boundary>
Content-Type: image/jpeg
Content-Length: <size>

<dados JPEG>
```

---

## 4. Exemplos Práticos com cURL

### Capturar Snapshot e Salvar como Arquivo

```bash
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/snapshot.cgi?channel=1&type=0" \
  -o captura.jpg
```

### Mover Câmera para Direita (velocidade 5)

```bash
# Iniciar movimento
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=start&channel=1&code=Right&arg1=0&arg2=5&arg3=0"

# Aguardar 2 segundos
sleep 2

# Parar movimento
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=stop&channel=1&code=Right&arg1=0&arg2=0&arg3=0"
```

### Ir para Preset 1

```bash
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=start&code=GotoPreset&channel=1&arg1=0&arg2=1&arg3=0"
```

### Zoom In

```bash
# Iniciar zoom
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=start&channel=1&code=ZoomWide&arg1=0&arg2=0&arg3=0"

sleep 1

# Parar zoom
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=stop&channel=1&code=ZoomWide&arg1=0&arg2=0&arg3=0"
```

### Mover para Posição Absoluta

```bash
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=moveAbsolutely&channel=1&arg1=0.5&arg2=-0.2&arg3=0.3"
```

### Verificar Status do PTZ

```bash
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=getStatus&channel=1"
```

### Listar Presets Configurados

```bash
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=getPresets&channel=1"
```

### Movimento Contínuo com Timeout

```bash
# Mover para cima-direita com zoom in por no máximo 30 segundos
curl --digest -u admin:senha \
  "http://192.168.1.108/cgi-bin/ptz.cgi?action=start&code=Continuously&channel=1&arg1=50&arg2=50&arg3=20&arg4=30"
```

---

> [!WARNING]
>
> - O índice de `channel` sempre começa em **1** (não 0)
> - Após um `start`, **sempre envie o `stop`** correspondente para cessar o movimento
> - Verifique as capacidades do protocolo PTZ antes de usar funcionalidades avançadas
> - A autenticação deve ser do tipo **Digest** (não Basic)
