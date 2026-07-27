/** Endereço do sidecar C#, entregue pelo processo principal via preload. */
export type BridgeEndpoint = {
  port: number;
  token: string;
};

export type BridgeState =
  | { status: "starting" }
  | { status: "ready"; endpoint: BridgeEndpoint }
  | { status: "failed"; error: string };

/** Configuração do NVR. A senha nunca volta do backend — só `hasPassword`. */
export type DeviceConfig = {
  ip: string;
  /** Porta do protocolo privado do SDK (37777), não a 80 da API HTTP. */
  port: number;
  user: string;
  hasPassword: boolean;
  channel: number;
  presetCount: number;
  homePreset: number;
  ptzSpeed: number;
  maxVideoWidth: number;
  useSubStream: boolean;
};

/** Campos aceitos em `config.set` — `password` só é enviado quando o usuário digita uma. */
export type DeviceConfigInput = Partial<Omit<DeviceConfig, "hasPassword">> & {
  password?: string;
};

export type DeviceStatus = {
  connected: boolean;
  serial: string;
  channelCount: number;
  deviceType: string;
};

export type Preset = {
  n: number;
  /** Marca de tempo da miniatura; 0 = sem miniatura. Entra na URL como `?v=`. */
  thumbRev: number;
};

export type PtzDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "upLeft"
  | "upRight"
  | "downLeft"
  | "downRight";

/** Estado do enlace com o sidecar (WebSocket), independente da sessão com o NVR. */
export type LinkState = "connecting" | "open" | "closed";

export type StreamFormat = {
  channel: number;
  /** Resolução que trafega — sempre 16:9. */
  width: number;
  height: number;
  fps: number;
  /**
   * Resolução informada pelo decodificador. Pode não ser 16:9: estes domos entregam
   * frames anamórficos (960×1080 no canal PTZ testado), e o backend estica a fonte
   * inteira para o quadro 16:9 — o mesmo que a janela de vídeo do SDK faz.
   */
  sourceWidth: number;
  sourceHeight: number;
};

export type HallGroup = {
  name: string;
  rows: number;
  seatsPerRow: number;
};

/** Maps seatId (e.g. "g0-r2-s1") to a presetId, or null if unassigned */
export type SeatMap = Record<string, number | null>;
