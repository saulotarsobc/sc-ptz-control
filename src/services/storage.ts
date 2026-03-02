import {
  DEFAULT_DEVICE,
  DEVICE_KEY,
  PRESETS_KEY,
  TOTAL_PRESETS,
} from "@/constants";
import type { DeviceConfig, Preset } from "@/types";

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

export function clearAllPresetImages(): void {
  const defaults = createDefaultPresets();
  localStorage.setItem(PRESETS_KEY, JSON.stringify(defaults));
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
