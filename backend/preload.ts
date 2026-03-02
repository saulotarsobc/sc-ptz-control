import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  GetPresets: () => ipcRenderer.invoke("GetPresets"),
  DeleteImage: (presetId: number) =>
    ipcRenderer.invoke("DeleteImage", presetId),
  GotoPreset: (presetId: number) => ipcRenderer.invoke("GotoPreset", presetId),
  SetPreset: (presetId: number) => ipcRenderer.invoke("SetPreset", presetId),
  GetSnapshot: (presetId: number) =>
    ipcRenderer.invoke("GetSnapshot", presetId),
  GetDeviceConfigs: () => ipcRenderer.invoke("GetDeviceConfigs"),
  SetDeviceConfigs: (data: {
    device: string;
    username: string;
    password: string;
    channel: string;
  }) => ipcRenderer.invoke("SetDeviceConfigs", data),
});
