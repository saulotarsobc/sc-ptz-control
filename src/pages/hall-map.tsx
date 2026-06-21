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
import { notifications } from "@mantine/notifications";
import { useCallback, useState } from "react";

export function HallMapPage() {
  const [presets] = useState<Preset[]>(() => getPresets());
  const [seatMap, setSeatMapState] = useState<SeatMap>(() => getSeatMap());

  const handleDrop = useCallback((seatId: string, presetId: number) => {
    assignSeat(seatId, presetId);
    setSeatMapState(getSeatMap());
  }, []);

  const handleRemove = useCallback((seatId: string) => {
    unassignSeat(seatId);
    setSeatMapState(getSeatMap());
  }, []);

  const handleGotoPreset = useCallback(async (presetId: number) => {
    const config = getDeviceConfig();
    try {
      await dvr.gotoPreset(config, presetId);
    } catch (err) {
      notifications.show({
        title: "Erro ao mover câmera",
        message: String(err instanceof Error ? err.message : err),
        color: "red",
      });
    }
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
