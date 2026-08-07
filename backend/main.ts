import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { displayName } from "../package.json";
import { getBridgeState, startBridge, stopBridge } from "./bridge";
import {
  __dirname,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL,
  VITE_PUBLIC,
} from "./constants";
import { installUpdate, setupAutoUpdater } from "./updater";

// === Application State ===
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: `${displayName} - v${app.getVersion()}`,
    icon: path.join(VITE_PUBLIC, "icon.ico"),
    width: 1400,
    height: 900,
    minHeight: 600,
    minWidth: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // webSecurity fica LIGADO: o renderer não fala mais direto com o NVR, só com o
      // sidecar em 127.0.0.1 (origem confiável no Chromium, sem bloqueio de conteúdo
      // misto) e o sidecar responde os cabeçalhos de CORS.
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

ipcMain.handle("bridge:state", () => getBridgeState());
ipcMain.handle("bridge:restart", async () => {
  stopBridge();
  return startBridge();
});
ipcMain.handle("update:install", () => installUpdate());

app.on("ready", async () => {
  // O sidecar sobe antes da janela para que a primeira tela já saiba se o serviço
  // está no ar — em vez de o renderer descobrir depois com uma tela vazia.
  await startBridge();
  createWindow();
  // Depois da janela: os eventos do updater são enviados para as janelas abertas,
  // e a checagem começa assim que a primeira existe.
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBridge();
});

app.on("second-instance", () => {
  // Focus main window if user tries to run a second instance
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});
