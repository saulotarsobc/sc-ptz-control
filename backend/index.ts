// Native
import { join } from "path";
import { format } from "url";
import request from "request";

let mainWindow;

// Packages
import isDev from "electron-is-dev";
import prepareNext from "electron-next";

// Modules
import { BrowserWindow, IpcMainEvent, app, ipcMain } from "electron";
import {
  getDeviceConfigs,
  getPresetsOfStorage,
  setDeviceConfigs,
  setPresetFakeImgById,
  setPresetImgById,
} from "./store";

const createWindow = () => {
  mainWindow = new BrowserWindow({
    height: 765,
    minHeight: 563,

    width: 640,
    minWidth: 640,

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      preload: join(__dirname, "preload.js"),
    },
  });

  mainWindow.setMenu(null);

  // open devtools
  // abre o devtools se estiver em modo de desenvolvimento
  // if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.loadURL(
    isDev
      ? `http://localhost:8000/`
      : format({
          pathname: join(__dirname, "../frontend/out/index.html"),
          protocol: "file:",
          slashes: true,
        })
  );
};

// Prepare the frontend once the app is ready
// Prepare o frontend quando o aplicativo estiver pronto
app.on("ready", async () => {
  await prepareNext("./frontend");
  createWindow();
});

// Quit the app once all windows are closed
// Saia do aplicativo quando todas as janelas estiverem fechadas
app.on("window-all-closed", app.quit);

/* ++++++++++ code ++++++++++ */
ipcMain.on("GotoPreset", (event: IpcMainEvent, presetId: number) => {
  const { device, username, password, channel }: any = getDeviceConfigs();
  console.log({ device, username, password, channel })
  const auth =  "Digest " + Buffer.from(`${username}:${password}`).toString("base64");
  request(
    {
      url: `http://${device}/cgi-bin/ptz.cgi?action=start&code=GotoPreset&channel=${channel}&arg1=0&arg2=${presetId}&arg3=0`,
      headers: {
        Authorization: auth,
      },
      auth: {
        username,
        password,
        sendImmediately: false,
      },
    },
    (error: any, _response: any, body: any) => {
      if (error) {
        event.returnValue = "erro";
      } else {
        event.returnValue = body;
      }
    }
  );
});

ipcMain.on("SetPreset", (event: IpcMainEvent, presetId: number) => {
  const { device, username, password, channel }: any = getDeviceConfigs();
  const auth =  "Digest " + Buffer.from(`${username}:${password}`).toString("base64");
  request(
    {
      url: `http://${device}/cgi-bin/ptz.cgi?action=start&code=SetPreset&channel=${channel}&arg1=0&arg2=${presetId}&arg3=0`,
      headers: {
        Authorization: auth,
      },
      auth: {
        username,
        password,
        sendImmediately: false,
      },
    },
    (error: any, _response: any, body: any) => {
      if (error) {
        event.returnValue = "erro";
      } else {
        event.returnValue = body;
      }
    }
  );
});

ipcMain.on("GetSnapshot", (event: IpcMainEvent, presetId: number) => {
  const { device, username, password, channel }: any = getDeviceConfigs();
  const auth =  "Digest " + Buffer.from(`${username}:${password}`).toString("base64");

  request(
    {
      url: `http://${device}/cgi-bin/snapshot.cgi?channel=${channel}&type=1`,
      headers: { Authorization: auth },
      auth: { username, password, sendImmediately: false },
      encoding: null,
    },
    (error: any, _response: any, body: any) => {
      if (error) {
        event.returnValue = "erro";
      } else {
        event.returnValue = "ok";
        setPresetImgById(presetId, body.toString("base64"));
      }
    }
  );
});

ipcMain.on("GetPresests", (event: IpcMainEvent) => {
  const data = getPresetsOfStorage();
  event.returnValue = data;
});

ipcMain.on("DeleteImage", (event: IpcMainEvent, presetId: number) => {
  setPresetFakeImgById(presetId);
  event.returnValue = "ok";
});

ipcMain.on("GetDeviceConfigs", (event: IpcMainEvent) => {
  const data = getDeviceConfigs();
  event.returnValue = data;
});

ipcMain.on("SetDeviceConfigs", (event, data: {}) => {
  setDeviceConfigs(data);
  event.returnValue = "ok";
});
