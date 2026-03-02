import { DeviceConfig, HallGroup } from "@/types";

export const PRESETS_KEY = "sc-ptz-presets";
export const DEVICE_KEY = "sc-ptz-device";
export const SEAT_MAP_KEY = "sc-ptz-seat-map";
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

export const HALL_LAYOUT: HallGroup[] = [
  { name: "Esquerdo", rows: 13, seatsPerRow: 3 },
  { name: "Centro", rows: 13, seatsPerRow: 5 },
  { name: "Direito", rows: 13, seatsPerRow: 3 },
];
