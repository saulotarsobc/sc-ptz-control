import type { DeviceConfig, Preset } from "@/types";

const PRESETS_KEY = "sc-ptz-presets";
const DEVICE_KEY = "sc-ptz-device";

const TOTAL_PRESETS = 24;

const DEFAULT_DEVICE: DeviceConfig = {
  device: "10.0.0.2:80",
  username: "admin",
  password: "admin",
  channel: "1",
};

function createDefaultPresets(): Preset[] {
  return Array.from({ length: TOTAL_PRESETS }, (_, i) => ({
    id: i + 1,
    img: "",
  }));
}

// — Presets —

export function getPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      return JSON.parse(raw) as Preset[];
    }
  } catch {
    // corrupted data, reset
  }
  const defaults = createDefaultPresets();
  localStorage.setItem(PRESETS_KEY, JSON.stringify(defaults));
  return defaults;
}

export function setPresetImage(presetId: number, base64Img: string): void {
  const presets = getPresets();
  const idx = presets.findIndex((p) => p.id === presetId);
  if (idx !== -1) {
    presets[idx].img = base64Img;
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }
}

export function clearPresetImage(presetId: number): void {
  setPresetImage(presetId, "");
}

// — Device Config —

export function getDeviceConfig(): DeviceConfig {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) {
      return JSON.parse(raw) as DeviceConfig;
    }
  } catch {
    // corrupted data, reset
  }
  localStorage.setItem(DEVICE_KEY, JSON.stringify(DEFAULT_DEVICE));
  return { ...DEFAULT_DEVICE };
}

export function setDeviceConfig(config: DeviceConfig): void {
  localStorage.setItem(DEVICE_KEY, JSON.stringify(config));
}
