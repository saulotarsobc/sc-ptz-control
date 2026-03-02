import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { displayName } from "../package.json";
import {
  getDeviceConfigs,
  getPresetsOfStorage,
  setDeviceConfigs,
  setPresetFakeImgById,
  setPresetImgById,
} from "./store";

// === Path Configuration ===
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(
  process.env.APP_ROOT,
  "..",
  "dist",
  "backend",
);
export const RENDERER_DIST = path.join(
  process.env.APP_ROOT,
  "..",
  "dist",
  "frontend",
);

// Public folder path (dev vs production)
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT!, "..", "public")
  : RENDERER_DIST;

// === Application State ===
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: `${displayName} - v${app.getVersion()}`,
    icon: path.join(process.env.VITE_PUBLIC, "icon.ico"),
    width: 1200,
    height: 800,
    minHeight: 600,
    minWidth: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

app.on("ready", () => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
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

// === IPC Handlers ===

ipcMain.handle("GetPresets", async () => {
  return getPresetsOfStorage();
});

ipcMain.handle("DeleteImage", async (_event, presetId: number) => {
  setPresetFakeImgById(presetId);
  return "ok";
});

ipcMain.handle("GotoPreset", async (_event, presetId: number) => {
  const { device, username, password, channel }: any = getDeviceConfigs();
  try {
    const url = `http://${device}/cgi-bin/ptz.cgi?action=start&code=GotoPreset&channel=${channel}&arg1=0&arg2=${presetId}&arg3=0`;
    const response = await fetch(url, {
      headers: {
        Authorization:
          "Digest " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
    });
    return await response.text();
  } catch {
    return "erro";
  }
});

ipcMain.handle("SetPreset", async (_event, presetId: number) => {
  const { device, username, password, channel }: any = getDeviceConfigs();
  try {
    const url = `http://${device}/cgi-bin/ptz.cgi?action=start&code=SetPreset&channel=${channel}&arg1=0&arg2=${presetId}&arg3=0`;
    const response = await fetch(url, {
      headers: {
        Authorization:
          "Digest " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
    });
    return await response.text();
  } catch {
    return "erro";
  }
});

ipcMain.handle("GetSnapshot", async (_event, presetId: number) => {
  const { device, username, password, channel }: any = getDeviceConfigs();
  try {
    const url = `http://${device}/cgi-bin/snapshot.cgi?channel=${channel}&type=1`;
    const response = await fetch(url, {
      headers: {
        Authorization:
          "Digest " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
    });
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    setPresetImgById(presetId, base64);
    return "ok";
  } catch {
    return "erro";
  }
});

ipcMain.handle("GetDeviceConfigs", async () => {
  return getDeviceConfigs();
});

ipcMain.handle(
  "SetDeviceConfigs",
  async (
    _event,
    data: {
      device: string;
      username: string;
      password: string;
      channel: string;
    },
  ) => {
    setDeviceConfigs(data);
    return "ok";
  },
);
