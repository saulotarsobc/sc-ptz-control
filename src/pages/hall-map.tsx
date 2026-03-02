import { HallMapGrid } from "@/components/HallMap/HallMapGrid";
import { PresetDragList } from "@/components/HallMap/PresetDragList";
import * as dvr from "@/services/dvr";
import {
  assignSeat,
  getDeviceConfig,
  getPresets,
  getSeatMap,
  unassignSeat,
} from "@/services/storage";
import type { Preset, SeatMap } from "@/types";
import { Flex } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";

export function HallMapPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [seatMap, setSeatMapState] = useState<SeatMap>({});

  const loadData = useCallback(() => {
    setPresets(getPresets());
    setSeatMapState(getSeatMap());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleDrop = useCallback(
    (seatId: string, presetId: number) => {
      assignSeat(seatId, presetId);
      loadData();
    },
    [loadData],
  );

  const handleRemove = useCallback(
    (seatId: string) => {
      unassignSeat(seatId);
      loadData();
    },
    [loadData],
  );

  const handleGotoPreset = useCallback(async (presetId: number) => {
    const config = getDeviceConfig();
    await dvr.gotoPreset(config, presetId);
  }, []);

  return (
    <Flex h="calc(100vh - 60px - 48px)" gap={0}>
      <Flex w={240} style={{ flexShrink: 0 }}>
        <PresetDragList presets={presets} seatMap={seatMap} />
      </Flex>

      <Flex flex={1} p="0">
        <HallMapGrid
          seatMap={seatMap}
          presets={presets}
          onDrop={handleDrop}
          onRemove={handleRemove}
          onGotoPreset={handleGotoPreset}
        />
      </Flex>
    </Flex>
  );
}
