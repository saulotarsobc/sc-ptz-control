# SC PTZ Control — Melhorias Propostas

> Documento de análise técnica com melhorias priorizadas para o projeto **SC PTZ Control**.
> Gerado em março/2026 com base na versão 3.0.1.

---

## Sumário

1. [Tema e Design System (Mantine)](#1-tema-e-design-system-mantine)
2. [UX — Feedback ao Usuário](#2-ux--feedback-ao-usuário)
3. [Arquitetura de Estado](#3-arquitetura-de-estado)
4. [Resiliência e Tratamento de Erros](#4-resiliência-e-tratamento-de-erros)
5. [Segurança](#5-segurança)
6. [Performance](#6-performance)
7. [Persistência de Dados](#7-persistência-de-dados)
8. [Funcionalidades Novas](#8-funcionalidades-novas)
9. [Qualidade de Código e DX](#9-qualidade-de-código-e-dx)
10. [Electron / Backend](#10-electron--backend)

---

## 1. Tema e Design System (Mantine)

### 1.1 Tema vazio — configurar `theme.ts`

**Problema:** O arquivo `src/theme.ts` exporta um objeto vazio (`{}`), desperdiçando toda a capacidade de customização do Mantine 8.

**Solução:** Preencher o tema com `primaryColor`, `defaultRadius`, `fontFamily`, `headings`, e `components` para garantir consistência visual sem precisar repetir props em cada instância.

```ts
// src/theme.ts
import { type MantineThemeOverride } from "@mantine/core";

const theme: MantineThemeOverride = {
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  headings: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  },
  components: {
    Card: {
      defaultProps: { radius: "md", withBorder: true },
    },
    Button: {
      defaultProps: { radius: "md" },
    },
    ActionIcon: {
      defaultProps: { radius: "md" },
    },
    TextInput: {
      defaultProps: { radius: "md" },
    },
    PasswordInput: {
      defaultProps: { radius: "md" },
    },
    Modal: {
      defaultProps: { radius: "md", centered: true },
    },
    Tooltip: {
      defaultProps: { withArrow: true },
    },
  },
};

export default theme;
```

**Impacto:** Remove dezenas de props repetidas (`withBorder`, `centered`, `withArrow`, `radius`) dos componentes.

### 1.2 Remover props redundantes dos componentes

Após configurar o tema, limpar props que agora são defaults globais:

| Componente       | Props para remover                                |
| ---------------- | ------------------------------------------------- |
| `PresetCard`     | `withBorder` do `<Card>`                          |
| `SettingsPage`   | `withBorder` do `<Card>`, `centered` do `<Modal>` |
| `HomePage`       | `centered` do `<Modal>`                           |
| `SeatCell`       | `withArrow` do `<Tooltip>`                        |
| `PresetDragList` | Nenhuma prop duplicada                            |

### 1.3 CSS Modules com variáveis Mantine inconsistentes

**Problema:** Há uso misto de variáveis Mantine (`var(--mantine-color-dark-6)`) e valores hardcoded (`rgba(0, 0, 0, 0.7)`, `rgba(34, 139, 34, 0.1)`).

**Solução:** Substituir todos os valores RGB hardcoded por variáveis Mantine equivalentes via `color-mix()` ou `alpha()` para suportar ambos os color schemes de forma consistente.

---

## 2. UX — Feedback ao Usuário

### 2.1 Ausência de notificações / toasts

**Problema:** Ações como "Salvar configurações", "Ir para preset", "Salvar posição", "Capturar snapshot" não dão feedback visual claro ao usuário. O único feedback existente é o botão "Salvo!" que muda de cor temporariamente na página de settings.

**Solução:** Instalar `@mantine/notifications` e usar `notifications.show()` para dar feedback de sucesso/erro em todas as ações do usuário.

```bash
bun add @mantine/notifications
```

**Ações que precisam de notificação:**

- ✅ Preset salvo com sucesso
- ✅ Configurações salvas
- ✅ Captura automática concluída
- ✅ Imagem removida
- ❌ Falha ao conectar ao DVR (atualmente silenciosa)
- ❌ Falha ao capturar snapshot (retorna `""` silenciosamente)

### 2.2 Sem indicador de loading para operações de rede

**Problema:** `gotoPreset()`, `setPreset()` e `getSnapshot()` fazem requisições HTTP, mas a UI não mostra nenhum estado de carregamento. O usuário não sabe se o comando foi enviado.

**Solução:**

- Usar `Skeleton` do Mantine nos `PresetCard` durante captura
- Adicionar estado `isLoading` por preset usando um `Set<number>` para ações individuais
- Usar `LoadingOverlay` na página de Settings ao salvar

### 2.3 PresetCard — estados de interação pobres

**Problema:** O card tem hover effect, mas não tem estado de "ativo" (quando clicado para ir ao preset), nem feedback visual de que a ação foi executada.

**Solução:**

- Adicionar um breve efeito de "pulse" ou "ring" quando `gotoPreset` é chamado
- Adicionar um ícone de "check" temporário após `setPreset` ter sucesso
- Desabilitar ações no card enquanto uma operação está em andamento

### 2.4 Validação de formulário na página Settings

**Problema:** O formulário de configurações não valida nenhum campo. O usuário pode salvar IP vazio, porta inválida, canal não-numérico, etc.

**Solução:**

- Validar `device` com regex (IP:porta ou hostname:porta)
- Validar `channel` como número inteiro positivo
- Validar `username` e `password` como não-vazios
- Mostrar erros inline usando a prop `error` dos inputs do Mantine

```tsx
<TextInput
  label="Endereço do dispositivo"
  value={config.device}
  error={!config.device ? "Obrigatório" : undefined}
  // ...
/>
```

---

## 3. Arquitetura de Estado

### 3.1 Sem gerenciamento de estado centralizado

**Problema:** Cada página faz `getDeviceConfig()`, `getPresets()`, etc., de forma independente, causando duplicação de lógica e possíveis inconsistências de estado.

**Solução:** Criar contextos React para os dados compartilhados:

```tsx
// src/contexts/DeviceContext.tsx
const DeviceContext = createContext<{
  config: DeviceConfig;
  setConfig: (c: DeviceConfig) => void;
} | null>(null);
```

**Contextos recomendados:**

- `DeviceConfigContext` — config do DVR/NVR
- `PresetsContext` — lista de presets com imagens
- `SeatMapContext` — mapa de assentos do auditório

### 3.2 `eslint-disable` para `set-state-in-effect`

**Problema:** Há `eslint-disable-next-line react-hooks/set-state-in-effect` em `settings.tsx` e `hall-map.tsx` para suprimir avisos de `setState` dentro de `useEffect`.

**Solução:** Mover a leitura do `localStorage` para fora do `useEffect` usando inicializador lazy do `useState`:

```tsx
const [config, setConfig] = useState<DeviceConfig>(() => getDeviceConfig());
```

Isso elimina o `useEffect` + `useCallback` de carregamento inicial e remove a necessidade do `eslint-disable`.

---

## 4. Resiliência e Tratamento de Erros

### 4.1 Erros silenciosos no serviço DVR

**Problema:** As funções `gotoPreset`, `setPreset`, e `getSnapshot` capturam todos os erros com `catch` vazio e retornam strings genéricas (`"erro"` ou `""`). O usuário nunca sabe o que deu errado.

```ts
// Atual
export async function gotoPreset(...): Promise<string> {
  try { ... }
  catch { return "erro"; }  // ← Sem detalhes
}
```

**Solução:**

- Criar tipos de erro específicos (`NetworkError`, `AuthError`, `TimeoutError`)
- Lançar exceções tipadas para que o consumidor possa reagir
- Adicionar timeout nas requisições fetch (hoje não há timeout — pode pendurar indefinidamente)

```ts
export class DvrError extends Error {
  constructor(
    message: string,
    public code: "NETWORK" | "AUTH" | "TIMEOUT" | "UNKNOWN",
  ) {
    super(message);
  }
}
```

### 4.2 Sem retry automático

**Problema:** Se a requisição falha (rede instável, câmera ocupada), não há mecanismo de retry.

**Solução:** Implementar retry com backoff exponencial para operações idempotentes (`gotoPreset`, `getSnapshot`):

```ts
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 500,
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries) throw err;
      await delay(baseDelay * 2 ** i);
    }
  }
  throw new Error("unreachable");
}
```

### 4.3 Sem timeout nas requisições HTTP

**Problema:** `fetchWithDigestAuth` não define timeout. Se o DVR travar, a UI fica travada esperando indefinidamente.

**Solução:** Usar `AbortController` com timeout:

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10_000);
const res = await fetch(url, { signal: controller.signal, ... });
clearTimeout(timeoutId);
```

### 4.4 Error Boundary ausente

**Problema:** Não há React Error Boundary. Um erro JS não tratado crasha a tela inteira.

**Solução:** Adicionar um Error Boundary global em `App.tsx` com tela de fallback amigável e botão de "Recarregar".

---

## 5. Segurança

### 5.1 Credenciais em texto plano no localStorage

**Problema:** `username` e `password` ficam em texto plano no `localStorage`, visíveis em DevTools e qualquer extensão do navegador/Electron.

**Solução:**

- **Ideal:** Usar `safeStorage` do Electron para criptografar credenciais no keychain do SO
- **Intermediário:** Usar `electron-store` com encriptação habilitada
- **Mínimo:** Já que `webSecurity: false` está habilitado, ao menos documentar o risco

### 5.2 `webSecurity: false` no BrowserWindow

**Problema:** O main process desabilita `webSecurity` para permitir requisições cross-origin ao DVR. Isso abre brechas de segurança (CORS bypass total, possível execução de scripts externos).

**Solução:** Manter `webSecurity: true` e rotear chamadas ao DVR pelo processo main via IPC:

```ts
// backend/main.ts
ipcMain.handle("dvr:gotoPreset", async (_event, config, presetId) => {
  // chamada HTTP feita no main process, não precisa de webSecurity: false
});
```

### 5.3 Nonce cache global no módulo `dvr.ts`

**Problema:** `cachedChallenge` e `nonceCount` são variáveis globais do módulo. Se o dispositivo for trocado nas configurações, o cache antigo pode causar falhas de autenticação silenciosas.

**Solução:** Invalidar o cache quando `DeviceConfig` mudar:

```ts
export function invalidateAuthCache(): void {
  cachedChallenge = null;
  nonceCount = 0;
}
```

Chamar `invalidateAuthCache()` em `setDeviceConfig()`.

---

## 6. Performance

### 6.1 Imagens base64 no localStorage

**Problema:** Cada preset armazena o snapshot como string base64 completa no `localStorage`. Com 100 presets e imagens de ~100KB cada, o `localStorage` pode atingir seu limite de ~5-10MB.

**Solução:**

- **Electron:** Salvar imagens como arquivos no `userData` via IPC e guardar apenas o path no localStorage
- **Web fallback:** Usar IndexedDB (suporta blobs grandes)

### 6.2 Re-renders desnecessários na `HomePage`

**Problema:** `loadPresets()` é chamado dentro de callbacks de `handleSetPreset`, `handleDeleteImage`, etc., forçando re-render de TODOS os `PresetCard` mesmo quando apenas um mudou.

**Solução:**

- Usar `React.memo` no `PresetCard` com comparação específica
- Passar callbacks estáveis (já usa `useCallback` ✓)
- Considerar virtualização com `@mantine/virtual` ou `react-window` para grids grandes (100 presets)

### 6.3 Falta de memoização no `HallMapGrid`

**Problema:** `renderGroup()` é uma função regular chamada no render, recriando todo o JSX do mapa a cada re-render.

**Solução:**

- Extrair `renderGroup` para um componente `HallGroup` separado com `React.memo`
- Memoizar `getPresetForSeat` com `useMemo` baseado em `seatMap` e `presets`

---

## 7. Persistência de Dados

### 7.1 Sem exportação/importação de dados

**Problema:** Se o usuário reinstalar o app ou trocar de máquina, perde todos os presets, configurações e mapeamento de assentos.

**Solução:** Adicionar na página Settings:

- **Exportar:** gerar arquivo `.json` com todos os dados do localStorage
- **Importar:** carregar arquivo `.json` e restaurar dados
- Usar `dialog.showSaveDialog()` / `dialog.showOpenDialog()` do Electron

### 7.2 Layout do auditório hardcoded

**Problema:** `HALL_LAYOUT` em `constants/index.ts` é um array fixo. Para mudar o layout é preciso editar código e recompilar.

**Solução:**

- Permitir configuração do layout na página Settings (ou uma nova página dedicada)
- Persistir layout no localStorage com a key `sc-ptz-hall-layout`
- Manter o valor atual como default fallback

---

## 8. Funcionalidades Novas

### 8.1 Preview ao vivo (live view)

**Descrição:** Mostrar um stream MJPEG ou snapshot periódico da câmera na posição atual.

**Implementação:**

- Usar endpoint de snapshot com polling (ex: a cada 2s)
- Exibir em um `Modal` ou painel lateral
- Permitir que o usuário veja o resultado do `gotoPreset` em tempo real

### 8.2 Controle PTZ manual (joystick virtual)

**Descrição:** Permitir mover a câmera livremente com pan/tilt/zoom via botões ou pad virtual.

**API disponível:** O DVR já suporta `ptz.cgi?action=start&code=Up|Down|Left|Right|ZoomWide|ZoomTele`

### 8.3 Nomes personalizados para presets

**Problema:** Presets são identificados apenas por número. Difícil lembrar "Preset 14 = Púlpito lateral".

**Solução:** Adicionar campo `name` ao tipo `Preset`:

```ts
export type Preset = {
  id: number;
  name: string; // novo
  img: string;
};
```

Exibir o nome no `PresetCard` e permitir edição inline com double-click.

### 8.4 Grupos/categorias de presets

**Descrição:** Organizar presets em grupos (ex: "Púlpito", "Plateia", "Balcão") para facilitar a navegação em grandes quantidades.

### 8.5 Atalhos de teclado

**Descrição:** Permitir operações rápidas via teclado:

- `1-9` → Ir para preset 1-9
- `Ctrl+S` → Salvar configurações
- `Esc` → Cancelar captura automática
- `←` `→` → Navegar entre páginas

Usar `useHotkeys` do `@mantine/hooks` (já instalado).

### 8.6 Indicador de status da conexão

**Descrição:** Mostrar no header se o DVR está acessível ou não (badge verde/vermelho).

**Implementação:**

- Ping periódico ao endpoint do DVR
- Badge de status na `AppShell.Header`
- Desabilitar ações quando offline

### 8.7 Histórico de ações / log

**Descrição:** Manter um log recente de ações realizadas (moveu para preset X, capturou preset Y, etc.) para depuração e auditoria.

---

## 9. Qualidade de Código e DX

### 9.1 Sem testes

**Problema:** Não há nenhum teste unitário ou de integração.

**Solução:**

- Adicionar Vitest (já compatível com Vite)
- Testar funções puras: `parseDigestChallenge`, `buildDigestHeader`, `generateCnonce`
- Testar serviço `storage.ts`: `getPresets`, `getDeviceConfig` (mockando `localStorage`)
- Testar componentes com `@testing-library/react`

```bash
bun add -d vitest @testing-library/react @testing-library/jest-dom jsdom
```

### 9.2 Tipagem pode ser mais estrita

**Problema:** O `channel` em `DeviceConfig` é `string` mas poderia ser `number`. O retorno de `gotoPreset()` é `Promise<string>` genérico.

**Solução:**

```ts
export type DeviceConfig = {
  device: string;           // "ip:porta"
  username: string;
  password: string;
  channel: number;           // ← era string
  totalPresets: number;
};

// gotoPreset deveria retornar void ou lançar erro
export async function gotoPreset(config: DeviceConfig, presetId: number): Promise<void> { ... }
```

### 9.3 Falta de JSDoc nos serviços

**Problema:** Apenas `autoCaptureAll` e `ColorSchemeToggle` possuem documentação. Funções críticas como `fetchWithDigestAuth`, `gotoPreset`, `getSnapshot` não têm JSDoc.

**Solução:** Documentar todas as funções públicas em `dvr.ts` e `storage.ts` com JSDoc incluindo `@param`, `@returns` e `@throws`.

### 9.4 Constantes mágicas

**Problema:** Valores como `CAPTURE_SETTLE_MS = 1000` estão em constantes, mas `timeout` para fetch, tamanho mínimo da janela (`500`), altura do header (`60`), largura do navbar (`30`) estão hardcoded nos componentes.

**Solução:** Mover todos os números mágicos para `constants/index.ts`:

```ts
export const HEADER_HEIGHT = 60;
export const NAVBAR_WIDTH = 30;
export const WINDOW_MIN_WIDTH = 500;
export const WINDOW_MIN_HEIGHT = 500;
export const FETCH_TIMEOUT_MS = 10_000;
```

---

## 10. Electron / Backend

### 10.1 Preload vazio

**Problema:** `backend/preload.ts` contém apenas um comentário. Não expõe nenhuma API via `contextBridge`.

**Solução:** Usar o preload para expor APIs seguras ao renderer:

```ts
// backend/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  saveFile: (data: string) => ipcRenderer.invoke("file:save", data),
  loadFile: () => ipcRenderer.invoke("file:load"),
});
```

### 10.2 Falta `requestSingleInstanceLock()`

**Problema:** O handler `second-instance` existe no main process, mas `requestSingleInstanceLock()` nunca é chamado. Múltiplas instâncias podem abrir simultaneamente.

**Solução:**

```ts
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
```

### 10.3 Sem atualização automática

**Problema:** Não há mecanismo de auto-update para o app Electron.

**Solução:** Integrar `electron-updater` com GitHub Releases:

```bash
bun add electron-updater
```

```ts
import { autoUpdater } from "electron-updater";
autoUpdater.checkForUpdatesAndNotify();
```

---

## Priorização Sugerida

| Prioridade | Item                                     | Esforço | Impacto |
| ---------- | ---------------------------------------- | ------- | ------- |
| 🔴 Alta    | 5.2 — Remover `webSecurity: false` (IPC) | Alto    | Crítico |
| 🔴 Alta    | 4.1 — Tratamento de erros no DVR         | Médio   | Alto    |
| 🔴 Alta    | 2.1 — Notificações de feedback           | Baixo   | Alto    |
| 🔴 Alta    | 1.1 — Configurar tema Mantine            | Baixo   | Médio   |
| 🟡 Média   | 5.1 — Criptografar credenciais           | Médio   | Alto    |
| 🟡 Média   | 4.3 — Timeout nas requisições            | Baixo   | Alto    |
| 🟡 Média   | 2.4 — Validação de formulário            | Baixo   | Médio   |
| 🟡 Média   | 3.2 — Remover `eslint-disable`           | Baixo   | Baixo   |
| 🟡 Média   | 8.3 — Nomes nos presets                  | Baixo   | Médio   |
| 🟡 Média   | 8.6 — Indicador de conexão               | Baixo   | Médio   |
| 🟡 Média   | 10.2 — Single instance lock              | Baixo   | Médio   |
| 🟢 Baixa   | 6.1 — Imagens fora do localStorage       | Alto    | Médio   |
| 🟢 Baixa   | 7.1 — Export/import de dados             | Médio   | Médio   |
| 🟢 Baixa   | 8.1 — Live preview                       | Alto    | Médio   |
| 🟢 Baixa   | 8.2 — Joystick PTZ virtual               | Alto    | Médio   |
| 🟢 Baixa   | 9.1 — Adicionar testes                   | Alto    | Alto    |
| 🟢 Baixa   | 10.3 — Auto-update                       | Médio   | Médio   |
