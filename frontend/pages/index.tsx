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
      global.api.GotoPreset({ device, username, password, presetId, channel });
    },
    [device, username, password, channel]
  );

  const GetSnapshot = useCallback(
    async (presetId: number) => {
      await global.api.GetSnapshot({
        device,
        username,
        password,
        presetId,
        channel,
      });
      GetPresests();
    },
    [device, username, password, channel]
  );

  const SetPreset = useCallback(
    (presetId: number) => {
      global.api.SetPreset({ device, username, password, presetId, channel });
      GetSnapshot(presetId);
    },
    [device, username, password, channel]
  );

  const DeleteImage = async (presetId: number) => {
    await global.api.DeleteImage(presetId);
    GetPresests();
  };

  return (
    <div className="w-full h-svh bg-[#aca4a4] grid justify-items-center overflow-y-scroll">
      <div className="my-8 w-[466px] h-[472px] grid grid-cols-4 grid-rows-5 gap-3">
        {presets.map((preset) => (
          <div
            className="bg-slate-400 w-[106px] h-[67px] rounded-md relative flex justify-between border-2 border-gray-500 hover:scale-150 hover:z-50 transition-all"
            key={preset.id}
          >
            <div className="absolute bg-white w-6 text-center aspect-square rounded-full m-[-10px]">
              {preset.id}
            </div>

            <div className="w-[100%] flex flex-col justify-center rounded-md">
              <img
                className="h-[46px] w-100%] mx-[1px] rounded-md border-2 border-gray-500"
                src={preset.img}
                alt="avatar"
              />
            </div>

            <div className="flex flex-col justify-around cursor-pointer bg-white rounded-r-md">
              <IconPlayerPlay
                className="fill-green-500 h-6 hover:h-6 transition-all"
                onClick={() => {
                  GotoPreset(preset.id);
                }}
              />

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
        <div>
          
        </div>
      </div>
    </div>
  );
}
