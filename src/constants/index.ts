import { DeviceConfig, HallGroup } from "@/types";

export const PRESETS_KEY = "sc-ptz-presets"; // Chave para armazenar os presets no localStorage
export const DEVICE_KEY = "sc-ptz-device"; // Chave para armazenar as configurações do dispositivo no localStorage
export const SEAT_MAP_KEY = "sc-ptz-seat-map"; // Chave para armazenar o mapa de assentos no localStorage
export const TOTAL_PRESETS = 50; // Número total de presets disponíveis para configuração. Pode ser ajustado conforme necessário, mas 50 é um número seguro para a maioria dos modelos de câmeras PTZ.
export const PRESET_MIN = 24; // Muitos modelos de câmeras começam a numerar os presets a partir do 1, e o preset 0 pode não ser reconhecido. 24 é um número seguro para a maioria dos casos, mas pode ser ajustado conforme necessário.
export const PRESET_MAX = 100; // Alguns modelos suportam até 255, mas a maioria tem um limite mais baixo. 100 é um número seguro para a maioria dos casos.
export const CAPTURE_SETTLE_MS = 1000; // Tempo para esperar a câmera estabilizar após mover para um preset

// Configuração padrão para o dispositivo, usada na primeira execução ou quando os dados são resetados. O usuário deve editar isso para corresponder às configurações da sua câmera.
export const DEFAULT_DEVICE: DeviceConfig = {
  device: "10.0.0.2:80",
  username: "admin",
  password: "admin",
  channel: 1,
  totalPresets: TOTAL_PRESETS,
};

// Layout do auditório para a funcionalidade de mapa de assentos.
// Cada grupo representa uma seção do auditório, com um número
// específico de fileiras e assentos por fileira.
// Este layout é apenas um exemplo e pode ser ajustado
// conforme necessário para corresponder ao layout real do auditório.
export const HALL_LAYOUT: HallGroup[] = [
  { name: "A", rows: 13, seatsPerRow: 3 },
  { name: "B", rows: 13, seatsPerRow: 5 },
  { name: "C", rows: 13, seatsPerRow: 3 },
];
