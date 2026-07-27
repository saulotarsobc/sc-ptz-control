import type { PresetView } from "@/services/bridge/usePresets";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArmchair, IconX } from "@tabler/icons-react";
import { DragEvent, useCallback, useState } from "react";
import classes from "./SeatCell.module.css";

interface SeatCellProps {
  seatId: string;
  preset: PresetView | null;
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

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const rawPresetId = e.dataTransfer.getData("presetId");
      const sourceSeatId = e.dataTransfer.getData("sourceSeatId");
      if (rawPresetId) {
        if (sourceSeatId && sourceSeatId !== seatId) {
          onRemove(sourceSeatId);
        }
        onDrop(seatId, Number(rawPresetId));
      }
    },
    [seatId, onDrop, onRemove],
  );

  const handleClick = useCallback(() => {
    if (preset) {
      onGotoPreset(preset.n);
    }
  }, [preset, onGotoPreset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && preset) {
        e.preventDefault();
        onGotoPreset(preset.n);
      }
    },
    [preset, onGotoPreset],
  );

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(seatId);
    },
    [seatId, onRemove],
  );

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!preset) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("presetId", String(preset.n));
      e.dataTransfer.setData("sourceSeatId", seatId);
      e.dataTransfer.effectAllowed = "all";
    },
    [preset, seatId],
  );

  const seatClassName = [
    classes.seat,
    preset ? classes.seatOccupied : "",
    isDragOver ? classes.seatDragOver : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip
      label={
        preset
          ? `${preset.name || `Preset ${preset.n}`} — Clique para ir`
          : `${seatId} — Arraste um preset aqui`
      }
      position="top"
      withArrow
      openDelay={300}
    >
      <div
        className={seatClassName}
        draggable={!!preset}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={preset ? handleKeyDown : undefined}
        tabIndex={preset ? 0 : undefined}
        role={preset ? "button" : undefined}
        aria-label={
          preset
            ? `Preset ${preset.n} na cadeira ${seatId}`
            : `Cadeira ${seatId} vazia`
        }
      >
        {preset ? (
          <>
            <div className={classes.presetBadge}>{preset.n}</div>
            {preset.thumbUrl ? (
              <img
                className={classes.thumbnail}
                src={preset.thumbUrl}
                alt={`Preset ${preset.n}`}
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
                aria-label={`Remover preset da cadeira ${seatId}`}
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
