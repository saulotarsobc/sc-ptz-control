import { CONTROLS_KEY, SEAT_MAP_KEY } from '@/constants';
import type { SeatMap } from '@/types';

/**
 * Persistência local do mapa de assentos.
 *
 * É o que sobrou aqui depois da migração para o backend C#: a configuração do NVR
 * (com a senha protegida por DPAPI), os nomes dos presets e as miniaturas agora vivem
 * em %APPDATA%/sc-ptz-control, gerenciados pelo sidecar. O mapa de assentos continua
 * sendo puramente de interface, sem relação com o equipamento.
 */

export function getSeatMap(): SeatMap {
  try {
    const raw = localStorage.getItem(SEAT_MAP_KEY);
    if (raw) return JSON.parse(raw) as SeatMap;
  } catch {
    // corrupted data, reset
  }
  return {};
}

export function setSeatMap(map: SeatMap): void {
  localStorage.setItem(SEAT_MAP_KEY, JSON.stringify(map));
}

export function assignSeat(seatId: string, presetId: number): void {
  const map = getSeatMap();
  map[seatId] = presetId;
  setSeatMap(map);
}

export function unassignSeat(seatId: string): void {
  const map = getSeatMap();
  delete map[seatId];
  setSeatMap(map);
}

/** Painel de controle visível. Padrão: visível na primeira execução. */
export function getControlsVisible(): boolean {
  return localStorage.getItem(CONTROLS_KEY) !== '0';
}

export function setControlsVisible(visible: boolean): void {
  localStorage.setItem(CONTROLS_KEY, visible ? '1' : '0');
}
