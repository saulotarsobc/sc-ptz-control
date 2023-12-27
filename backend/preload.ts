import { ipcRenderer } from "electron";

declare global {
  namespace NodeJS {
    interface Global {
      API: any;
    }
  }
}

process.once("loaded", () => {
  (global as any).api = {
    GetPresests: () => ipcRenderer.sendSync("GetPresests"),
    DeleteImage: (id: number) => ipcRenderer.sendSync("DeleteImage", id),
    GotoPreset: (data: {}) => ipcRenderer.sendSync("GotoPreset", data),
    SetPreset: (data: {}) => ipcRenderer.sendSync("SetPreset", data),
    GetSnapshot: (data: {}) => ipcRenderer.sendSync("GetSnapshot", data),
    GetDeviceConfigs: () => ipcRenderer.sendSync("GetDeviceConfigs"),
    SetDeviceConfigs: (data: {}) => ipcRenderer.sendSync("SetDeviceConfigs",data),
  };
});
