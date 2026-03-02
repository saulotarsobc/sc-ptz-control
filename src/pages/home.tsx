import { PresetCard } from "@/components/PresetCard";
import type { Preset } from "@/types";
import {
  Alert,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconCamera } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

export function HomePage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPresets = useCallback(async () => {
    try {
      if (!window.api) {
        setError("API não disponível. Execute dentro do Electron.");
        setLoading(false);
        return;
      }
      const data = await window.api.GetPresets();
      setPresets(data);
      setError(null);
    } catch {
      setError("Erro ao carregar presets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleGotoPreset = useCallback(async (presetId: number) => {
    if (!window.api) return;
    await window.api.GotoPreset(presetId);
  }, []);

  const handleSetPreset = useCallback(
    async (presetId: number) => {
      if (!window.api) return;
      await window.api.SetPreset(presetId);
      await window.api.GetSnapshot(presetId);
      await loadPresets();
    },
    [loadPresets],
  );

  const handleDeleteImage = useCallback(
    async (presetId: number) => {
      if (!window.api) return;
      await window.api.DeleteImage(presetId);
      await loadPresets();
    },
    [loadPresets],
  );

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Group justify="center" py="xl">
          <Loader size="lg" />
        </Group>
      </Container>
    );
  }

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
      <Group mb="md">
        <IconCamera size={28} />
        <Title order={2}>Presets PTZ</Title>
      </Group>

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
