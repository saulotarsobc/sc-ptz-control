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

    DeleteImage: (presetId: number) =>
      ipcRenderer.sendSync("DeleteImage", presetId),

    GotoPreset: (presetId: number) =>
      ipcRenderer.sendSync("GotoPreset", presetId),

    SetPreset: (presetId: number) =>
      ipcRenderer.sendSync("SetPreset", presetId),

    GetSnapshot: (presetId: number) =>
      ipcRenderer.sendSync("GetSnapshot", presetId),

    GetDeviceConfigs: () => ipcRenderer.sendSync("GetDeviceConfigs"),

    SetDeviceConfigs: (data: {}) =>
      ipcRenderer.sendSync("SetDeviceConfigs", data),
  };
});
