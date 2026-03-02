import { DEFAULT_DEVICE, DEVICE_KEY, PRESETS_KEY } from "@/constants";
import type { DeviceConfig, Preset } from "@/types";

function createDefaultPresets(total: number): Preset[] {
  return Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    img: "",
  }));
}

// — Presets —
export function getPresets(): Preset[] {
  const { totalPresets } = getDeviceConfig();
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Preset[];
      if (stored.length === totalPresets) return stored;
      if (stored.length > totalPresets) {
        const trimmed = stored.slice(0, totalPresets);
        localStorage.setItem(PRESETS_KEY, JSON.stringify(trimmed));
        return trimmed;
      }
      // stored.length < totalPresets: expand
      const extra = Array.from(
        { length: totalPresets - stored.length },
        (_, i) => ({ id: stored.length + i + 1, img: "" }),
      );
      const expanded = [...stored, ...extra];
      localStorage.setItem(PRESETS_KEY, JSON.stringify(expanded));
      return expanded;
    }
  } catch {
    // corrupted data, reset
  }
  const defaults = createDefaultPresets(totalPresets);
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
  const { totalPresets } = getDeviceConfig();
  const defaults = createDefaultPresets(totalPresets);
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
