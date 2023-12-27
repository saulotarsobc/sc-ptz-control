export type windowSize = { h: number; w: number };

export type Preset = {
  id: number;
  img: string;
};

export type ParamsToRequest = {
  device: string;
  username: string;
  password: number;
  presetId: number;
  channel: number;
};
