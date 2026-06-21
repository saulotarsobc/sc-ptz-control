# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev          # Start Vite dev server with Electron (HMR enabled)
pnpm build        # tsc + vite build (outputs to dist/)
pnpm lint         # ESLint over .ts/.tsx files
pnpm preview      # Preview production build

# Distribution
pnpm dist         # generate-electron-builder → build → electron-builder → out/
```

Run a single ESLint check on a specific file:
```bash
pnpm eslint src/services/dvr.ts
```

There are no automated tests in this project.

## Architecture

**SC PTZ Control** is an Electron desktop app that controls PTZ cameras on Intelbras DVR/NVR devices via HTTP Digest Auth APIs.

### Process separation

```
Electron Main (backend/main.ts)
  └─ BrowserWindow (contextIsolation: true, nodeIntegration: false)
       └─ Preload (backend/preload.ts) — currently a stub
            └─ React Renderer (src/)
```

The renderer uses **only Web APIs** (`fetch`, `localStorage`, `crypto.getRandomValues`, `FileReader`). There is no IPC bridge and no Node.js access from the renderer.

### Build outputs

| Path | Contents |
|---|---|
| `dist/frontend/` | Vite-built React SPA |
| `dist/backend/main.mjs` | Electron main process |
| `dist/backend/preload.mjs` | Preload script |
| `out/` | Platform installers (electron-builder) |

Vite config (`vite.config.ts`) uses `vite-plugin-electron/simple` with separate `main` and `preload` entries. The `@/` alias maps to `src/`.

### Renderer layer (src/)

Three pages routed via `HashRouter`:

- **`/`** — `HomePage`: grid of 24–100 preset cards; single-click moves camera; auto-capture captures all snapshots sequentially
- **`/hall-map`** — `HallMapPage`: drag-and-drop assignment of presets to auditorium seats (groups A/B/C × rows × seats)
- **`/settings`** — `SettingsPage`: DVR IP, credentials, channel, preset count

State is local `useState` per page — no global store.

### Data layer

**`src/services/dvr.ts`** — All camera communication:
- Implements RFC 2617 Digest Auth with nonce caching to avoid double-roundtrip on every call
- `gotoPreset`, `setPreset`, `getSnapshot`, `autoCaptureAll`
- `autoCaptureAll` is sequential: move → settle delay (3 s) → snapshot, with `AbortSignal` support

**`src/services/storage.ts`** — `localStorage` CRUD:
- Keys: `sc-ptz-presets`, `sc-ptz-device`, `sc-ptz-seat-map`
- Handles preset array resize when `totalPresets` changes

### Key types (`src/types/index.ts`)

```ts
Preset        = { id: number; img: string }           // img is base64 data URL
DeviceConfig  = { device, username, password, channel, totalPresets }
HallGroup     = { name, rows, seatsPerRow }
SeatMap       = Record<string, number | null>          // "g0-r2-s1" → presetId
```

### Styling

Mantine 9 with CSS Modules. `src/theme.ts` is currently an empty object — extend it there to reduce prop repetition across components. PostCSS uses `postcss-preset-mantine` + `postcss-simple-vars`.

### Backend constants (`backend/constants/index.ts`)

Centralizes `__dirname` (ESM-compatible), `VITE_DEV_SERVER_URL`, `RENDERER_DIST`, and `VITE_PUBLIC`. Import from here rather than re-deriving in `main.ts`.

## Important notes

- `webSecurity: false` is set in `BrowserWindow` to allow `fetch` to DVR devices on local `http://` URLs.
- All credentials (username, password) are stored unencrypted in `localStorage`.
- `package.json` has `"type": "module"` — all Node.js files use ESM (`import`/`export`), not `require`.
- The `dist` script uses `bun` to run the generator scripts, even though the project otherwise uses `pnpm`.
