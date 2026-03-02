import { PresetCard } from "@/components/PresetCard/PresetCard";
import * as dvr from "@/services/dvr";
import {
  clearPresetImage,
  getDeviceConfig,
  getPresets,
  setPresetImage,
} from "@/services/storage";
import type { Preset } from "@/types";
import { Alert, Container, SimpleGrid } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

export function HomePage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadPresets = useCallback(() => {
    try {
      const data = getPresets();
      setPresets(data);
      setError(null);
    } catch {
      setError("Erro ao carregar presets.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPresets();
  }, [loadPresets]);

  const handleGotoPreset = useCallback(async (presetId: number) => {
    const config = getDeviceConfig();
    await dvr.gotoPreset(config, presetId);
  }, []);

  const handleSetPreset = useCallback(
    async (presetId: number) => {
      const config = getDeviceConfig();
      await dvr.setPreset(config, presetId);
      const base64 = await dvr.getSnapshot(config);
      if (base64) {
        setPresetImage(presetId, base64);
      }
      loadPresets();
    },
    [loadPresets],
  );

  const handleDeleteImage = useCallback(
    (presetId: number) => {
      clearPresetImage(presetId);
      loadPresets();
    },
    [loadPresets],
  );

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Erro"
          color="red"
          variant="light"
        >
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="md">
      <SimpleGrid
        cols={{ base: 2, xs: 3, sm: 4, md: 5, lg: 6 }}
        spacing="sm"
        verticalSpacing="sm"
      >
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            onGotoPreset={handleGotoPreset}
            onSetPreset={handleSetPreset}
            onDeleteImage={handleDeleteImage}
          />
        ))}
      </SimpleGrid>
    </Container>
  );
}
