import type { Preset, SeatMap } from "@/types";
import { Badge, ScrollArea } from "@mantine/core";
import { IconCameraOff } from "@tabler/icons-react";
import { DragEvent } from "react";
import classes from "./PresetDragList.module.css";

interface PresetDragListProps {
  presets: Preset[];
  seatMap: SeatMap;
}

function getAssignedSeatIds(presetId: number, seatMap: SeatMap): string[] {
  return Object.entries(seatMap)
    .filter(([, pId]) => pId === presetId)
    .map(([seatId]) => seatId);
}

export function PresetDragList({ presets, seatMap }: PresetDragListProps) {
  const handleDragStart = (e: DragEvent<HTMLDivElement>, presetId: number) => {
    e.dataTransfer.setData("presetId", String(presetId));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className={classes.listContainer}>
      <ScrollArea h="100%" offsetScrollbars>
        {presets.map((preset) => {
          const assignedTo = getAssignedSeatIds(preset.id, seatMap);
          const isAssigned = assignedTo.length > 0;

          return (
            <div
              key={preset.id}
              className={`${classes.presetItem} ${isAssigned ? classes.presetItemAssigned : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, preset.id)}
            >
              <span className={classes.presetNumber}>{preset.id}</span>

              <div className={classes.thumbWrapper}>
                {preset.img ? (
                  <img
                    className={classes.thumbImg}
                    src={preset.img}
                    alt={`Preset ${preset.id}`}
                    draggable={false}
                  />
                ) : (
                  <IconCameraOff
                    size={14}
                    stroke={1.2}
                    color="var(--mantine-color-dimmed)"
                  />
                )}
              </div>

              {isAssigned ? (
                <Badge
                  size="xs"
                  variant="light"
                  color="blue"
                  className={classes.assignedBadge}
                >
                  {assignedTo.length}x
                </Badge>
              ) : (
                <Badge
                  size="xs"
                  variant="light"
                  color="yellow"
                  className={classes.assignedBadge}
                >
                  0x
                </Badge>
              )}
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}
