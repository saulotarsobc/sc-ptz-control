# Varredura automática de presets — sc-ptz-control

## Contexto

Hoje montar a grade de presets de um Salão do Reino é trabalho manual pessoa a pessoa: o operador
dirige o joystick até enquadrar cada trecho de plateia e aperta "salvar", repetindo isso 24–100
vezes. Leva cerca de uma hora, e precisa ser refeito por inteiro se a câmera for deslocada, se as
cadeiras forem remanejadas ou ao instalar o sistema em outro salão.

A geometria do problema, porém, é simples: os assentos formam uma área contínua, e a câmera é um
domo com pan/tilt/zoom. Se soubermos as coordenadas dos **quatro cantos da plateia**, todas as
posições intermediárias são interpolação — não precisam ser dirigidas à mão.

O objetivo é substituir a hora de joystick por **~3 minutos**: calibrar 4 cantos, escolher a grade,
e deixar a câmera percorrer sozinha gravando cada preset com sua miniatura. O operador revisa as
miniaturas e corrige na mão apenas as poucas que saírem tortas.

### O que hoje impede isso

O sidecar só sabe **movimento contínuo** (aperta/solta por velocidade) e os três comandos de preset
por número. Não há posicionamento absoluto nem leitura da posição atual —
[NvrClient.cs:259-268](../native/PtzBridge/Sdk/NvrClient.cs#L259-L268) chama
`CLIENT_DHPTZControlEx2` sempre com `param4 = IntPtr.Zero`. Sem saber onde a câmera está nem mandá-la
a um ângulo, nenhuma varredura geométrica é possível.

O NetSDK 3.050 tem tudo o que falta; é só não estar exposto.

---

## Restrição que decide o resto: o domo suporta absoluto?

Domos IP/HDCVI modernos aceitam `EXACTGOTO`/`MOVE_ABSOLUTELY` e informam a posição. Domos analógicos
em RS-485 (Pelco-D e afins) **não têm nada disso** — só movimento contínuo.

Por isso a **Etapa 0 é um diagnóstico entregável sozinho**: descobre empiricamente o que o
equipamento aceita e imprime na tela. Só depois de rodá-lo contra o NVR real decidimos se vale
construir o modo cronometrado de reserva (Etapa 4). Construir os dois às cegas seria metade do
trabalho jogado fora.

---

## Etapa 0 — Diagnóstico de capacidades do domo

Descobre, contra o equipamento: aceita posicionamento absoluto? informa a posição? qual a faixa
física de pan/tilt? quantos presets suporta?

**Novo:** `sc-ptz-control/native/PtzBridge/Sdk/PtzInterop.cs`

O wrapper `NetSDKCS` vem da pasta de demos do SDK e é compilado direto de lá
([PtzBridge.csproj:40-44](../native/PtzBridge/PtzBridge.csproj#L40-L44)) — **não é
editável**. As structs que faltam vão neste arquivo novo, com layout copiado dos headers em
`helpers/NetSDK 3.050/C++/…/include/`:

| Símbolo                                               | Fonte                         | Por quê                                                                                                                            |
| ----------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NET_PTZ_LOCATION_INFO`                               | `dhnetsdk.h:19670`            | leitura de posição; o C# só tem o enum `EM_DEVICE_STATE.PTZ_LOCATION = 0x0036` (`NetSDKStruct.cs:27557`), a struct é só comentário |
| `CFG_PTZ_PROTOCOL_CAPS_INFO` + `CFG_PTZ_MOTION_RANGE` | `dhconfigsdk.h:9662` / `9580` | capacidades; a constante `"ptz.getCurrentProtocolCaps"` também não existe no C#                                                    |

Não precisa de novos `DllImport`: `CLIENT_QueryDevState`, `CLIENT_QueryNewSystemInfo` e
`CLIENT_DHPTZControlEx2` já estão em `OriginalSDK.cs` (linhas 164, 167, 98) e têm wrapper amigável em
`NetSDK.cs`. `NET_PTZ_CONTROL_ABSOLUTELY` / `NET_PTZ_SPACE_UNIT` / `NET_PTZ_SPEED_UNIT` também já
existem (`NetSDKStruct.cs:2270/2323/2294`).

**Em** [NvrClient.cs](../native/PtzBridge/Sdk/NvrClient.cs), na região `#region PTZ`:

```csharp
/// Capacidades do protocolo PTZ do canal. Nem todo domo aceita absoluto.
public PtzCaps PtzGetCaps(int channel)   // ptz.getCurrentProtocolCaps
// → { absolute, status, direct, presetMin, presetMax, panMin, panMax, tiltMin, tiltMax, intervalMs }

/// Posição atual em décimos de grau. moving = bState != 2.
public PtzPosition PtzGetPosition(int channel)  // QueryDevState(PTZ_LOCATION)
// → { pan 0..3600, tilt -1800..1800, zoom 0..128, moving, presetId }
```

**Em** [NvrService.cs](../native/PtzBridge/Server/NvrService.cs) e
[ControlSocket.cs:95-118](../native/PtzBridge/Server/ControlSocket.cs#L95-L118): dois ops
novos, `ptz.caps` e `ptz.position`, no mesmo padrão dos existentes (`lock (_sdkGate)` +
`EnsureConnected()`).

**No renderer:** funções em [api.ts](../src/services/bridge/api.ts), tipos em
[types/index.ts](../src/types/index.ts), e um painel de diagnóstico em
[settings.tsx](../src/pages/settings.tsx) ao lado de "Testar conexão", mostrando em
português o que o domo aceita.

> **Ponto de decisão.** Rodar contra o NVR real. Se `absolute` e `status` vierem `true`, seguir para
> a Etapa 1. Se vierem `false`, pular direto para a Etapa 4.
> A config atual aponta para `127.0.0.1:8958` — provavelmente um simulador. O diagnóstico precisa do
> equipamento de verdade para valer.

---

## Etapa 1 — Posicionamento absoluto

**Em** [NvrClient.cs](../native/PtzBridge/Sdk/NvrClient.cs):

```csharp
/// Vai a um ângulo absoluto. Pan/tilt em décimos de grau, zoom 1..128.
public void PtzGotoAbsolute(int channel, int pan, int tilt, int zoom)
```

Usa `EM_EXTPTZ_ControlType.EXACTGOTO` (só `lParam1/2/3`, sem marshal) quando o tilt alvo é ≥ 0 —
que é o caso normal de um domo de teto olhando para a plateia. Para tilt negativo, cai em
`MOVE_ABSOLUTELY` com `NET_PTZ_CONTROL_ABSOLUTELY` marshalada em `param4`, cuja faixa de tilt é
−1800..1800.

O `Ptz(...)` privado (linha 259) fixa `p3 = 0`; precisa de um overload que aceite o terceiro
parâmetro e um ponteiro opcional.

**Em** [NvrService.cs](../native/PtzBridge/Server/NvrService.cs): op `ptz.gotoAbsolute`
com `settle: true` — o sidecar envia o comando e faz o polling de `PtzGetPosition` a cada 150 ms até
`moving == false` **e** a posição estar dentro de uma tolerância do alvo (~5 décimos de grau), com
timeout de 8 s, devolvendo a posição final.

> **Invariante:** o polling **não pode segurar o `_sdkGate`** durante a espera — pega e solta a cada
> consulta. Segurar por segundos congelaria PTZ, vídeo e config do app inteiro.

Dois cuidados de equipamento: alguns domos reportam `bState == 2` (parado) antes de começarem a se
mover — daí a checagem de proximidade do alvo e um atraso mínimo de ~300 ms antes do primeiro poll.
E `caps.intervalMs` é o intervalo mínimo entre comandos que o próprio domo declara; respeitá-lo.

---

## Etapa 2 — Geometria da varredura

**Novo:** `sc-ptz-control/src/services/sweep/geometry.ts` — módulo **puro**, sem SDK e sem React.

Entrada: os 4 cantos calibrados, cada um `{ pan, tilt, zoom }`:

```
A = fila da frente, extremo esquerdo      B = fila da frente, extremo direito
C = última fila, extremo esquerdo         D = última fila, extremo direito
```

Para a célula (i, j) de uma grade `cols × rows`, com `u = (i+0.5)/cols` e `v = (j+0.5)/rows`:

```
P(u,v) = (1−v)·[(1−u)·A + u·B] + v·[(1−u)·C + u·D]
```

Interpolação **bilinear**, aplicada independentemente a pan, tilt e zoom. É o que corrige o efeito
trapézio: a última fila ocupa menos pan que a primeira, e se a câmera não estiver no centro do salão
o tilt da esquerda difere do da direita. Um retângulo simples em pan/tilt erraria o enquadramento
justamente nas pontas e no fundo.

O zoom interpolado por `v` resolve a profundidade sozinho: o operador enquadra os cantos do fundo
mais fechados, e as filas intermediárias recebem zoom proporcional.

Detalhes que o módulo precisa acertar:

- **Pan é cíclico (0..3600).** Desdobrar cada canto em relação a `A.pan` escolhendo, entre
  `p−3600 | p | p+3600`, o mais próximo; interpolar no espaço desdobrado; reembrulhar no fim com
  `((x % 3600) + 3600) % 3600`. Sem isso, uma plateia que cruze o zero faz a câmera dar a volta.
- **Ordem de visita ≠ numeração.** Visitar em serpentina (fila 0 da esquerda para a direita, fila 1
  ao contrário) para cortar o tempo de percurso, mas numerar em ordem de leitura
  (`preset = presetInicial + j*cols + i`) para o operador ter um modelo mental previsível.
- **Faixa de presets.** Validar `cols*rows` contra `config.presetCount` e contra `caps.presetMax`.
  Um `presetInicial` configurável evita atropelar o `homePreset` — que num salão costuma ser a
  tribuna, e não pode ser sobrescrito.

---

## Etapa 3 — Assistente de varredura (a tela)

**Novo:** `sc-ptz-control/src/pages/sweep.tsx` + componentes em `src/components/Sweep/`, rota em
[App.tsx:21-27](../src/App.tsx#L21-L27) e item no menu.

Assistente de quatro passos, com o `LiveView` sempre visível ao lado:

1. **Diagnóstico** — mostra o resultado da Etapa 0. Se o domo não aceita absoluto, o assistente diz
   isso claramente aqui em vez de falhar no meio da varredura.
2. **Calibrar os 4 cantos** — para cada canto: o operador usa o `PtzPanel` que já existe para
   enquadrar, e aperta "Marcar canto". O app lê `ptz.position` e guarda. Miniatura de cada canto
   marcado, para conferência.
3. **Escolher a grade** — colunas × filas, preset inicial. **Prévia calculada na hora**: tabela com
   pan/tilt/zoom de cada célula e o total de presets. Nada é escrito no equipamento ainda. É aqui
   que o operador itera — e é também a verificação da geometria, sem precisar mexer na câmera.
4. **Executar** — barra de progresso e botão de parar, no mesmo padrão de
   [`handleCaptureAll`](../src/pages/home.tsx#L159-L202) (`AbortController` +
   `throwIfAborted`). Por célula, em ordem de serpentina:

   ```
   ptz.gotoAbsolute { pan, tilt, zoom, settle: true }
   preset.set { preset }              ← RPC que já existe
   delay(PRESET_SAVE_SETTLE_MS)       ← 400 ms, constante que já existe
   captureThumb(preset)               ← do frame ao vivo, como hoje
   ```

   Falha numa célula registra o erro e segue — como o `.catch(() => {})` de
   [home.tsx:187](../src/pages/home.tsx#L187) já faz. No fim, um resumo do que deu certo.
   Estimativa: ~2,5–4 s por preset → 30 presets em ~2 min.

**Novo:** `src/services/sweep/useSweep.ts` — a máquina de estados, para a página ficar só com a UI.

**Refatoração necessária:** `captureThumb` está inline em
[home.tsx:80-95](../src/pages/home.tsx#L80-L95) e depende do `stream` e do `endpoint`.
Extrair para `src/services/bridge/useThumbCapture.ts` e consumir nas duas telas. É o único jeito de
reusar sem duplicar — e a miniatura precisa vir do canvas do renderer, que é por onde o app já
captura hoje (o `SnapPictureEx` do SDK é assíncrono, D1 e um por vez).

**Persistir a calibração.** Os 4 cantos + a grade vão para o sidecar, por canal
(`%APPDATA%/sc-ptz-control/sweep.json`, ao lado do `config.json` — o sidecar já é o dono do estado,
ver [AppConfig.cs](../native/PtzBridge/Sdk/AppConfig.cs)). Assim, remanejar as cadeiras
ou refazer a grade com mais colunas é reexecutar, sem recalibrar.

---

## Etapa 4 — Modo cronometrado (condicional)

**Só construir se a Etapa 0 disser que o domo não tem absoluto.**

Sem coordenadas, calibra-se por tempo: o operador aponta na borda esquerda da plateia e aperta
"início", dirige até a borda direita e aperta "fim" — o app cronometra o pan contínuo a uma
velocidade fixa. Mesma coisa no tilt, entre a primeira e a última fila. A varredura então anda em
serpentina com pulsos de `T_pan/(cols−1)` ms, gravando o preset a cada parada.

Zoom fica **fixo** neste modo — não há como interpolar profundidade de forma confiável. As filas do
fundo saem abertas demais e o operador corrige na mão.

A precisão é medíocre (rampa do motor, folga mecânica), mas cada preset gravado é uma posição real do
equipamento, e as miniaturas mostram na hora quais precisam de ajuste. Ainda assim elimina a maior
parte do trabalho.

**Atenção ao [PtzWatchdog](../native/PtzBridge/Server/PtzWatchdog.cs):** o prazo é de
1200 ms por eixo. Pulsos longos precisam ser fatiados em trechos ≤ 1000 ms com re-arme, ou o backend
para o motor no meio do percurso.

---

## Como fazer isso num Salão do Reino

O procedimento, uma vez por instalação (~10 min contando a conferência):

1. **Câmera fixa e definitiva.** Qualquer deslocamento posterior invalida a calibração. Refazer leva
   3 min, mas é preciso lembrar de refazer.
2. **Enquadramento-padrão: ~3 cadeiras de largura**, com folga acima da cabeça. Não enquadrar uma
   cadeira só — quem comenta pode ter sentado uma cadeira ao lado, e o
   [HALL_LAYOUT](../src/constants/index.ts#L30-L34) atual tem 143 assentos contra um teto
   de 100 presets. Preset cobre **trecho de plateia**, não pessoa.
3. **Calibrar com o salão vazio**, mas com a **iluminação da reunião** — foco e íris se comportam
   diferente com as luzes de ensaio.
4. **Marcar os 4 cantos** enquadrando cada um como se fosse o preset final daquele ponto. Os dois
   cantos do fundo ficam mais fechados no zoom que os da frente; é essa diferença que o app usa para
   interpolar a profundidade.
5. **Grade sugerida** para o layout atual (blocos A=3 + B=5 + C=3 cadeiras, 13 filas): **4 colunas ×
   6 faixas = 24 presets**, cada um cobrindo ~3 cadeiras × ~2 filas. Com `presetCount = 30` já
   configurado, 5 × 6 também cabe e dá mais folga nas laterais.
6. **Executar** (~2 min) e **revisar as miniaturas** na tela inicial. Corrigir na mão as poucas
   tortas com o botão "salvar" que já existe.
7. **Mapa do Salão** continua manual nesta versão — arrastar preset para cadeira. Preenchê-lo
   automaticamente a partir da grade é o próximo passo natural, mas exige tornar o `HALL_LAYOUT`
   configurável (hoje está fixo no código, e o próprio comentário diz que é exemplo).

**Não vamos fazer detecção de rosto/pessoa.** Seria uma dependência pesada de visão computacional num
sidecar que hoje tem **zero pacotes NuGet** por decisão de projeto — e não resolve melhor: os
assentos são fixos e as pessoas trocam de lugar, então a grade cobre o salão independentemente de
quem está sentado. Se um dia fizer sentido, os frames NV12 já existem em
[ChannelStream.cs](../native/PtzBridge/Streaming/ChannelStream.cs). Vale antes verificar
se o próprio domo tem auto-tracking/IVS nativo.

---

## Verificação

Não há testes automatizados no projeto; a verificação é manual contra o equipamento.
`pnpm lint` está quebrado (typescript-eslint 8 × typescript 7) — usar `npx tsc --noEmit`.

```powershell
cd sc-ptz-control
pnpm build:bridge      # compila o sidecar; precisa de helpers/ presente
npx tsc --noEmit       # checagem de tipos do renderer
pnpm dev
```

Roteiro de teste, na ordem:

1. **Diagnóstico** (Etapa 0) — conectar ao NVR real (não ao simulador em `127.0.0.1:8958`) e conferir
   `ptz.caps`. Anotar `absolute`, `status`, faixa de pan/tilt e `presetMax`.
2. **Leitura de posição** — mover pelo `PtzPanel` e confirmar que `ptz.position` acompanha, e que
   `moving` volta a `false` ao parar. Sem isso, o `settle` da Etapa 1 não funciona.
3. **Absoluto isolado** — mandar `ptz.gotoAbsolute` para um ângulo conhecido, conferir que a câmera
   chega e que a posição lida bate com o alvo dentro da tolerância. Testar um alvo do outro lado do
   salão para exercitar o timeout.
4. **Geometria sem mexer na câmera** — calibrar os 4 cantos e olhar a prévia do passo 3 do
   assistente: os pans devem crescer monotonicamente da esquerda para a direita, o span da última
   fila deve ser **menor** que o da primeira (trapézio), e o zoom deve crescer com a profundidade.
   Testar também com os cantos posicionados de forma a cruzar o pan 0/3600.
5. **Varredura curta** — rodar 2 × 2 numa faixa de presets descartável (ex.: a partir de 90, longe do
   `homePreset`) e conferir as 4 miniaturas.
6. **Varredura completa** — a grade real do salão. Cronometrar. Depois apertar `preset.goto` em
   alguns presets e confirmar que a câmera volta exatamente ao enquadramento da miniatura.
7. **Abortar no meio** — confirmar que o botão de parar interrompe, que a câmera não fica em
   movimento e que os presets já gravados continuam válidos.

## Convenções a respeitar

- **pt-BR** em comentários, documentação e textos de interface.
- Comentário explica **o porquê** (invariante, contorno), não narra o código.
- **Presets são só números** — o SDK suporta nome (`PTZ_PRESET.szName`), mas foi decisão explícita do
  usuário não ter. Não reintroduzir.
- Canais são **1-based** no protocolo e na UI; a conversão para base 0 acontece só na borda do
  `NvrService`.
- Commit: `<tipo>: <resumo>` com o porquê no corpo.
