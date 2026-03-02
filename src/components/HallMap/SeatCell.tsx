import type { Preset } from "@/types";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArmchair, IconX } from "@tabler/icons-react";
import { DragEvent, useState } from "react";
import classes from "./SeatCell.module.css";

interface SeatCellProps {
  seatId: string;
  preset: Preset | null;
  onDrop: (seatId: string, presetId: number) => void;
  onRemove: (seatId: string) => void;
  onGotoPreset: (presetId: number) => void;
}

export function SeatCell({
  seatId,
  preset,
  onDrop,
  onRemove,
  onGotoPreset,
}: SeatCellProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const presetId = e.dataTransfer.getData("presetId");
    if (presetId) {
      onDrop(seatId, Number(presetId));
    }
  };

  const handleClick = () => {
    if (preset) {
      onGotoPreset(preset.id);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(seatId);
  };

  const seatClassName = [
    classes.seat,
    preset ? classes.seatOccupied : "",
    isDragOver ? classes.seatDragOver : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip
      label={preset ? `Preset ${preset.id} — Clique para ir` : seatId}
      position="top"
      withArrow
      openDelay={300}
    >
      <div
        className={seatClassName}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {preset ? (
          <>
            <div className={classes.presetBadge}>{preset.id}</div>
            {preset.img ? (
              <img
                className={classes.thumbnail}
                src={preset.img}
                alt={`Preset ${preset.id}`}
                draggable={false}
              />
            ) : (
              <IconArmchair
                size={16}
                stroke={1.2}
                className={classes.emptyIcon}
              />
            )}
            <div className={classes.removeBtn}>
              <ActionIcon
                variant="filled"
                color="red"
                size={14}
                radius="xl"
                onClick={handleRemoveClick}
              >
                <IconX size={10} />
              </ActionIcon>
            </div>
          </>
        ) : (
          <IconArmchair size={14} stroke={1} className={classes.emptyIcon} />
        )}
      </div>
    </Tooltip>
  );
}
