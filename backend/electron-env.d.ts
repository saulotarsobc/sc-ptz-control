/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string;
    VITE_PUBLIC: string;
  }
}

interface Window {
  ipcRenderer: import("electron").IpcRenderer;
  api: {
    GetPresets: () => Promise<Array<{ id: number; img: string }>>;
    DeleteImage: (presetId: number) => Promise<string>;
    GotoPreset: (presetId: number) => Promise<string>;
    SetPreset: (presetId: number) => Promise<string>;
    GetSnapshot: (presetId: number) => Promise<string>;
    GetDeviceConfigs: () => Promise<{
      device: string;
      username: string;
      password: string;
      channel: string;
    }>;
    SetDeviceConfigs: (data: {
      device: string;
      username: string;
      password: string;
      channel: string;
    }) => Promise<string>;
  };
}
