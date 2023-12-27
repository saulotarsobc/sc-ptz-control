import Store from "electron-store";
import { fakePressets } from "../mock";
import { Preset } from "../@types";

const storage = new Store({});

export const getPresetsOfStorage = () => {
  const data = storage.get("presets");
  if (data) {
    return data;
  } else {
    storage.set("presets", fakePressets);
    return fakePressets;
  }
};

export const setPresetImgById = (presetId: number, newImage: string) => {
  const data = storage.get("presets") as Preset[];
  data[presetId - 1].img = "data:image/png;base64," + newImage;
  storage.set("presets", data);
};

export const setPresetFakeImgById = (presetId: number) => {
  const data = storage.get("presets") as Preset[];
  data[presetId - 1].img = fakePressets[0].img;
  storage.set("presets", data);
};

export const getDeviceConfigs = () => {
  const data = storage.get("device");
  if (data) {
    return data;
  } else {
    const fakeDevice = {
      device: "10.0.0.2:80",
      username: "admin",
      password: "admin",
      channel: "8",
    };
    storage.set("device", fakeDevice);
    return fakeDevice;
  }
};

export const setDeviceConfigs = (data: any) => {
  storage.set("device", data);
};
