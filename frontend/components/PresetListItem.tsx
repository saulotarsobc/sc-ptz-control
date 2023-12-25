import {
  IconCircleCheckFilled,
  IconDeviceFloppy,
  IconEdit,
  IconTrashXFilled,
} from "@tabler/icons-react";
import React, { useCallback } from "react";

type PresetListItemProps = {
  presetId: number;
};

export default function PresetListItem({ presetId }: PresetListItemProps) {
  const handleEdit = useCallback((presetId: number) => {
    console.log(presetId);
  }, []);

  const handleDelete = useCallback((presetId: number) => {
    console.log(presetId);
  }, []);

  const handleSave = useCallback((presetId: number) => {
    console.log(presetId);
  }, []);

  const handleCall = useCallback((presetId: number) => {
    console.log(presetId);
  }, []);

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

      <div className="flex">
        <IconEdit onClick={() => handleEdit(presetId)} />
        <IconTrashXFilled onClick={() => handleDelete(presetId)} />
        <IconDeviceFloppy onClick={() => handleSave(presetId)} />
        <IconCircleCheckFilled onClick={() => handleCall(presetId)} />
      </div>
    </div>
  );
}
