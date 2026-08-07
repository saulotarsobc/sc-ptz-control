import { HallGroup } from "@/types";

/**
 * Chave do mapa de assentos no localStorage.
 *
 * É o único estado que ainda mora aqui: configuração, nomes de preset e miniaturas
 * passaram a ser do sidecar C# (%APPDATA%/sc-ptz-control), tanto para não guardar
 * credencial em claro quanto para não estourar a cota do localStorage com imagens.
 */
export const SEAT_MAP_KEY = "sc-ptz-seat-map";

/** Painel de controle visível ou não — preferência de quem opera, fica por conta da UI. */
export const CONTROLS_KEY = "sc-ptz-controls-visible";

/** Faixa aceita para a quantidade de presets exibida na grade. */
export const PRESET_MIN = 24;
export const PRESET_MAX = 100;

/** Espera após mover para um preset antes de capturar a miniatura. */
export const CAPTURE_SETTLE_MS = 1500;

/** Espera após gravar um preset — o equipamento leva um instante para confirmar. */
export const PRESET_SAVE_SETTLE_MS = 400;

/**
 * Tempo máximo esperando o primeiro frame quando o vídeo é ligado só para capturar a
 * miniatura (controles escondidos). Abrir o real-play de um canal que não estava sendo
 * decodificado costuma levar 1–3 s; o limite alto só existe para não travar de vez.
 */
export const VIDEO_WARMUP_MS = 8000;

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
