import {
  IconCircleCheckFilled,
  IconDeviceFloppy,
  IconEdit,
  IconTrashXFilled,
} from "@tabler/icons-react";
import React, { useCallback, useEffect, useState } from "react";

type PresetListItemProps = {
  presetId: number;
};

export default function PresetListItem({ presetId }: PresetListItemProps) {
  const [channel, setChannel] = useState("8");

  const handleEdit = useCallback((presetId: number) => {}, []);

  const handleDelete = useCallback((presetId: number) => {}, []);

  const handleSave = useCallback(
    // Name  Type  R/O  Description  Example
    // channel  int  R  The PTZ channel index; starting from 1  1
    // arg1  int  R  The preset number; starting from 1  2
    // arg2  char[256]  R  The preset name  "preset2"
    (presetId: number) => {
      fetch(
        `http://127.0.0.1:3000/?action=start&code=GotoPreset&channel=${channel}&arg2=${presetId}`
      )
        .then((data) => console.log(data.body))
        .catch((e: Error) => console.warn(e.message));
    },
    [channel]
  );

  const handleCall = useCallback(
    (presetId: number) => {
      fetch(
        `http://127.0.0.1:3000/?action=start&code=GotoPreset&channel=${channel}&arg2=${presetId}`
      )
        .then((data) => {
          console.log(data.body);
        })
        .catch((e: Error) => console.warn(e.message));
    },
    [channel]
  );

  return (
    <div className="preset w-[350px] bg-slate-600 flex flex-row justify-between p-1 mt-[1px] rounded-md">
      <label
        className="bg-white w-7 h-7 rounded-full mr-1 text-center"
        htmlFor="preset-1"
      >
        {presetId}
      </label>

      <input
        className="border-2 px-2 rounded-md"
        type="text"
        name="preset-name-1"
        id="preset-name-1"
        value={"Nome " + presetId}
      />

      <div className="flex gap-1">
        {/* <IconEdit onClick={() => handleEdit(presetId)} /> */}
        <IconTrashXFilled onClick={() => handleDelete(presetId)} />
        <IconDeviceFloppy onClick={() => handleSave(presetId)} />
        <IconCircleCheckFilled onClick={() => handleCall(presetId)} />
      </div>
    </div>
  );
}
