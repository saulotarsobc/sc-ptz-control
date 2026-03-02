import { HALL_LAYOUT } from "@/constants";
import type { HallGroup, Preset, SeatMap } from "@/types";
import { ScrollArea } from "@mantine/core";
import classes from "./HallMapGrid.module.css";
import { SeatCell } from "./SeatCell";

interface HallMapGridProps {
  seatMap: SeatMap;
  presets: Preset[];
  onDrop: (seatId: string, presetId: number) => void;
  onRemove: (seatId: string) => void;
  onGotoPreset: (presetId: number) => void;
}

function getPresetForSeat(
  seatId: string,
  seatMap: SeatMap,
  presets: Preset[],
): Preset | null {
  const presetId = seatMap[seatId];
  if (presetId == null) return null;
  return presets.find((p) => p.id === presetId) ?? null;
}

function renderGroup(
  group: HallGroup,
  groupIndex: number,
  props: HallMapGridProps,
) {
  const rows = [];
  for (let r = 0; r < group.rows; r++) {
    const seats = [];
    for (let s = 0; s < group.seatsPerRow; s++) {
      const seatId = `g${groupIndex}-r${r}-s${s}`;
      const preset = getPresetForSeat(seatId, props.seatMap, props.presets);
      seats.push(
        <SeatCell
          key={seatId}
          seatId={seatId}
          preset={preset}
          onDrop={props.onDrop}
          onRemove={props.onRemove}
          onGotoPreset={props.onGotoPreset}
        />,
      );
    }
    rows.push(
      <div key={`g${groupIndex}-r${r}`} className={classes.row}>
        <div className={classes.rowNumber}>{r + 1}</div>
        {seats}
      </div>,
    );
  }

  return (
    <div key={groupIndex} className={classes.group}>
      <div className={classes.groupLabel}>{group.name}</div>
      {rows}
    </div>
  );
}

export function HallMapGrid(props: HallMapGridProps) {
  return (
    <ScrollArea h="100%" w="100%" offsetScrollbars>
      <div className={classes.hallContainer}>
        <div className={classes.stageIndicator}>Palco</div>
        <div className={classes.groupsWrapper}>
          {HALL_LAYOUT.map((group, index) => renderGroup(group, index, props))}
        </div>
      </div>
    </ScrollArea>
  );
}
