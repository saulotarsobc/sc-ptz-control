import { useCallback, useEffect, useState } from "react";
import {
  IconCameraOff,
  IconDeviceFloppy,
  IconPlayerPlay,
} from "@tabler/icons-react";
import type { Preset } from "../types";

export default function versao2() {
  const [presets, setPresets] = useState<Preset[]>([]);

  const [device, setDevice] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [channel, setChannel] = useState("");

  const handlesetDevice = (e: any) => {
    setDevice(e.target.value);
  };
  const handlesetUsername = (e: any) => {
    setUsername(e.target.value);
  };
  const handlesetPassword = (e: any) => {
    setPassword(e.target.value);
  };
  const handlesetChannel = (e: any) => {
    setChannel(e.target.value);
  };

  const GetPresests = useCallback(async () => {
    const data = await global.api.GetPresests();
    setPresets(data);
  }, []);

  const GetDeviceConfigs = useCallback(async () => {
    const data = await global.api.GetDeviceConfigs();
    setDevice(data.device);
    setUsername(data.username);
    setPassword(data.password);
    setChannel(data.channel);
  }, []);

  const SetDeviceConfigs = useCallback(() => {
    global.api.SetDeviceConfigs({ device, username, password, channel });
    GetDeviceConfigs();
  }, [device, username, password, channel]);

  useEffect(() => {
    global.api ? GetPresests() : null;
    global.api ? GetDeviceConfigs() : null;
  }, []);

  const GotoPreset = useCallback(
    (presetId: number) => {
      global.api.GotoPreset(presetId);
    },
    [device, username, password, channel]
  );

  const GetSnapshot = useCallback(
    async (presetId: number) => {
      await global.api.GetSnapshot(presetId);
      GetPresests();
    },
    [device, username, password, channel]
  );

  const SetPreset = useCallback(
    (presetId: number) => {
      global.api.SetPreset(presetId);
      GetSnapshot(presetId);
    },
    [device, username, password, channel]
  );

  const DeleteImage = async (presetId: number) => {
    await global.api.DeleteImage(presetId);
    GetPresests();
  };

  return (
    <div className="w-full h-svh bg-gray-300 grid justify-items-center overflow-y-scroll">
      <div className="my-1 w-[600px] h-[580px] grid grid-cols-4 grid-rows-5 gap-1">
        {presets.map((preset) => (
          <div
            // hover:scale-125 hover:z-50 transition-all
            className=" w-[147px] h-[95px] bg-white overflow-hidden rounded-md relative flex justify-between border-2 border-gray-500"
            key={preset.id}
          >
            <div className="absolute bg-[#3f3f3f] text-white w-6 text-center aspect-square rounded-full">
              {preset.id}
            </div>

            <div className="h-full w-ful flex flex-col justify-center">
              <div
                className="w-[119px] h-[70px] cursor-pointer overflow-hidden rounded-md  border-2 border-gray-200"
                onClick={() => {
                  GotoPreset(preset.id);
                }}
              >
                {preset.id != 1 ? (
                  <img
                    className="h-[170px] mt-[-20px] aspect-video object-cover"
                    src={preset.img}
                    alt="avatar"
                  />
                ) : (
                  <img className="aspect-video" src={preset.img} alt="avatar" />
                )}
              </div>
            </div>

            <div className="flex flex-col justify-around cursor-pointer bg-white rounded-r-md">
              <IconCameraOff
                className="fill-red-500 h-6 hover:h-6 transition-all"
                onClick={() => {
                  DeleteImage(preset.id);
                }}
              />
              <IconDeviceFloppy
                className="fill-yellow-300 h-6 hover:h-6 transition-all"
                onClick={() => {
                  SetPreset(preset.id);
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white w-[466px] h-[170px] rounded-md border-2 border-gray-500 mb-4 flex">
        <div className="w-[250px] flex flex-col gap-1">
          <input
            className="border-2 w-44"
            type="text"
            value={device}
            onChange={handlesetDevice}
          />
          <input
            className="border-2 w-44"
            type="text"
            value={username}
            onChange={handlesetUsername}
          />
          <input
            className="border-2 w-44"
            type="password"
            value={password}
            onChange={handlesetPassword}
          />
          <input
            className="border-2 w-44"
            type="text"
            value={channel}
            onChange={handlesetChannel}
          />

          <button
            className="border-2 w-44 bg-slate-400"
            onClick={SetDeviceConfigs}
          >
            Salvar
          </button>
        </div>

        {/* joystick */}
        <div></div>
      </div>
    </div>
  );
}
