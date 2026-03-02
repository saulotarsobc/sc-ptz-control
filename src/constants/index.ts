import { DeviceConfig } from "@/types";

export const PRESETS_KEY = "sc-ptz-presets";
export const DEVICE_KEY = "sc-ptz-device";
export const TOTAL_PRESETS = 50;
export const PRESET_MIN = 24;
export const PRESET_MAX = 100;

export const DEFAULT_DEVICE: DeviceConfig = {
  device: "10.0.0.2:80",
  username: "admin",
  password: "admin",
  channel: "1",
  totalPresets: TOTAL_PRESETS,
};
