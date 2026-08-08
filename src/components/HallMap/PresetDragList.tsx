import type { PresetView } from '@/services/bridge/usePresets';
import type { SeatMap } from '@/types';
import { Badge, ScrollArea } from '@mantine/core';
import { IconCameraOff } from '@tabler/icons-react';
import { DragEvent } from 'react';
import classes from './PresetDragList.module.css';

interface PresetDragListProps {
  presets: PresetView[];
  seatMap: SeatMap;
}

function getAssignedSeatIds(presetId: number, seatMap: SeatMap): string[] {
  return Object.entries(seatMap)
    .filter(([, pId]) => pId === presetId)
    .map(([seatId]) => seatId);
}

export function PresetDragList({ presets, seatMap }: PresetDragListProps) {
  const handleDragStart = (e: DragEvent<HTMLDivElement>, presetId: number) => {
    e.dataTransfer.setData('presetId', String(presetId));
    e.dataTransfer.effectAllowed = 'all';
  };

  return (
    <div className={classes.listContainer}>
      <ScrollArea h="100%" offsetScrollbars>
        {presets.map((preset) => {
          const assignedTo = getAssignedSeatIds(preset.n, seatMap);
          const isAssigned = assignedTo.length > 0;

          return (
            <div
              key={preset.n}
              className={`${classes.presetItem} ${isAssigned ? classes.presetItemAssigned : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, preset.n)}
            >
              <span className={classes.presetNumber}>{preset.n}</span>

              <div className={classes.thumbWrapper}>
                {preset.thumbUrl ? (
                  <img
                    className={classes.thumbImg}
                    src={preset.thumbUrl}
                    alt={`Preset ${preset.n}`}
                    draggable={false}
                  />
                ) : (
                  <IconCameraOff size={14} stroke={1.2} color="var(--mantine-color-dimmed)" />
                )}
              </div>

              <Badge
                size="xs"
                variant="light"
                color={isAssigned ? 'signalBlue' : 'yellow'}
                className={classes.assignedBadge}
              >
                {assignedTo.length}x
              </Badge>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}
