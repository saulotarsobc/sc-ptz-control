export type Preset = {
  id: number;
  img: string;
};

export type SquarePreset = {
  preset: Preset;
  GotoPreset?: any;
  SetPreset?: any;
  GetSnapshot?: any;
};
