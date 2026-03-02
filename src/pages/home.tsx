import { PresetCard } from "@/components/PresetCard/PresetCard";
import { CAPTURE_SETTLE_MS } from "@/constants";
import type { AutoCaptureProgress } from "@/services/dvr";
import * as dvr from "@/services/dvr";
import {
  clearPresetImage,
  getDeviceConfig,
  getPresets,
  setPresetImage,
} from "@/services/storage";
import type { Preset } from "@/types";
import {
  Alert,
  Button,
  Container,
  Group,
  Progress,
  SimpleGrid,
  Text,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCamera,
  IconPlayerStop,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function HomePage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Auto-capture state
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] =
    useState<AutoCaptureProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  const handleAutoCapture = useCallback(async () => {
    const config = getDeviceConfig();
    const currentPresets = getPresets();
    const presetIds = currentPresets.map((p) => p.id);

    const controller = new AbortController();
    abortRef.current = controller;
    setCapturing(true);
    setCaptureProgress(null);

    try {
      await dvr.autoCaptureAll(
        config,
        presetIds,
        (progress) => setCaptureProgress(progress),
        (presetId, base64) => {
          setPresetImage(presetId, base64);
          loadPresets();
        },
        controller.signal,
        CAPTURE_SETTLE_MS,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — images already saved incrementally
      }
    } finally {
      setCapturing(false);
      setCaptureProgress(null);
      abortRef.current = null;
    }
  }, [loadPresets]);

  const handleStopCapture = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const progressPercent = captureProgress
    ? (captureProgress.current / captureProgress.total) * 100
    : 0;

  const progressLabel = captureProgress
    ? captureProgress.phase === "moving"
      ? `Movendo para preset ${captureProgress.presetId}... (${captureProgress.current}/${captureProgress.total})`
      : `Capturando preset ${captureProgress.presetId}... (${captureProgress.current}/${captureProgress.total})`
    : "";

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
      <Group justify="flex-end" mb="sm">
        {capturing ? (
          <Button
            leftSection={<IconPlayerStop size={16} />}
            color="red"
            variant="light"
            onClick={handleStopCapture}
          >
            Parar captura
          </Button>
        ) : (
          <Button
            leftSection={<IconCamera size={16} />}
            variant="light"
            onClick={handleAutoCapture}
          >
            Capturar todos
          </Button>
        )}
      </Group>

      {capturing && captureProgress && (
        <div style={{ marginBottom: 12 }}>
          <Text size="sm" c="dimmed" mb={4}>
            {progressLabel}
          </Text>
          <Progress value={progressPercent} size="sm" radius="xl" animated />
        </div>
      )}

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
            isCapturing={capturing && captureProgress?.presetId === preset.id}
          />
        ))}
      </SimpleGrid>
    </Container>
  );
}
