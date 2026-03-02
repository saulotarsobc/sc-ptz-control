export type Preset = {
  id: number;
  img: string;
};

export type DeviceConfig = {
  device: string;
  username: string;
  password: string;
  channel: string;
};

export interface ElectronAPI {
  GetPresets: () => Promise<Preset[]>;
  DeleteImage: (presetId: number) => Promise<string>;
  GotoPreset: (presetId: number) => Promise<string>;
  SetPreset: (presetId: number) => Promise<string>;
  GetSnapshot: (presetId: number) => Promise<string>;
  GetDeviceConfigs: () => Promise<DeviceConfig>;
  SetDeviceConfigs: (data: DeviceConfig) => Promise<string>;
}
