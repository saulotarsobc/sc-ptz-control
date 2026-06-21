export type Preset = {
  id: number;
  img: string;
};

export type DeviceConfig = {
  device: string;
  username: string;
  password: string;
  channel: number;
  totalPresets: number;
};

export type HallGroup = {
  name: string;
  rows: number;
  seatsPerRow: number;
};

/** Maps seatId (e.g. "g0-r2-s1") to a presetId, or null if unassigned */
export type SeatMap = Record<string, number | null>;
