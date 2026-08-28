import { app, BrowserWindow, ipcMain, Menu, session, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { displayName } from '../package.json';
import { getBridgeState, startBridge, stopBridge } from './bridge';
import { __dirname, RENDERER_DIST, VITE_DEV_SERVER_URL, VITE_PUBLIC } from './constants';

// === Application State ===
let mainWindow: BrowserWindow | null = null;

function assertTrustedIpc(event: IpcMainInvokeEvent): void {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('IPC rejeitado: origem não confiável.');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: `${displayName} - v${app.getVersion()}`,
    // O PNG é o ícone versionado usado pela janela; o instalador gera o ícone do executável.
    icon: path.join(VITE_PUBLIC, 'icon.png'),
    width: 1400,
    height: 900,
    minHeight: 600,
    minWidth: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // webSecurity fica LIGADO: o renderer não fala mais direto com o NVR, só com o
      // sidecar em 127.0.0.1 (origem confiável no Chromium, sem bloqueio de conteúdo
      // misto) e o sidecar responde os cabeçalhos de CORS.
    },
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (!current) return event.preventDefault();
    const targetUrl = new URL(url);
    const currentUrl = new URL(current);
    const allowed =
      currentUrl.protocol === 'file:'
        ? targetUrl.protocol === 'file:' && targetUrl.pathname === currentUrl.pathname
        : targetUrl.origin === currentUrl.origin;
    if (!allowed) event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url);
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.pathname.startsWith('/saulotarsobc/sc-ptz-control')
    ) {
      void shell.openExternal(parsed.toString());
    }
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// O app não usa o menu padrão; removê-lo antes de `ready` evita trabalho de startup.
Menu.setApplicationMenu(null);

ipcMain.handle('bridge:state', (event) => {
  assertTrustedIpc(event);
  return getBridgeState();
});
ipcMain.handle('bridge:restart', async (event) => {
  assertTrustedIpc(event);
  stopBridge();
  return startBridge();
});
ipcMain.handle('update:install', async (event) => {
  assertTrustedIpc(event);
  const { installUpdate } = await import('./updater');
  installUpdate();
});

app.on('ready', () => {
  // O renderer não precisa de permissões do Chromium: câmera virtual e rede do NVR
  // são tratadas pelo sidecar nativo. Negar por padrão reduz a superfície do app.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  // Mostra a UI imediatamente. O renderer já sabe representar o estado "starting",
  // então não há motivo para segurar a janela durante a inicialização do sidecar.
  createWindow();
  void startBridge();

  // O updater e suas dependências ficam fora do caminho crítico de startup.
  mainWindow?.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      void import('./updater').then(({ setupAutoUpdater }) => setupAutoUpdater());
    }, 1_500);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBridge();
});

app.on('second-instance', () => {
  // Focus main window if user tries to run a second instance
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});
