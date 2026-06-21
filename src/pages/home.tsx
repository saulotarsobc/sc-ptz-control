import { PresetCard } from "@/components/PresetCard/PresetCard";
import { CAPTURE_SETTLE_MS } from "@/constants";
import type { AutoCaptureProgress } from "@/services/dvr";
import * as dvr from "@/services/dvr";
import {
  clearAllPresetImages,
  clearPresetImage,
  getDeviceConfig,
  getPresets,
  setPresetImage,
} from "@/services/storage";
import type { Preset } from "@/types";
import {
  Button,
  Container,
  Group,
  Modal,
  Progress,
  SimpleGrid,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCamera,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";

export function HomePage() {
  const [presets, setPresets] = useState<Preset[]>(() => getPresets());
  const [clearModalOpen, setClearModalOpen] = useState(false);

  // Auto-capture state
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] =
    useState<AutoCaptureProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      throw err;
    }
  }, []);

  const handleSetPreset = useCallback(async (presetId: number) => {
    const config = getDeviceConfig();
    try {
      await dvr.setPreset(config, presetId);
      const base64 = await dvr.getSnapshot(config);
      setPresetImage(presetId, base64);
      setPresets((prev) =>
        prev.map((p) => (p.id === presetId ? { ...p, img: base64 } : p)),
      );
      notifications.show({
        title: "Preset salvo",
        message: `Posição atual salva no preset ${presetId}.`,
        color: "green",
      });
    } catch (err) {
      notifications.show({
        title: "Erro ao salvar preset",
        message: String(err instanceof Error ? err.message : err),
        color: "red",
      });
      throw err;
    }
  }, []);

  const handleDeleteImage = useCallback((presetId: number) => {
    clearPresetImage(presetId);
    setPresets((prev) =>
      prev.map((p) => (p.id === presetId ? { ...p, img: "" } : p)),
    );
  }, []);

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
          setPresets((prev) =>
            prev.map((p) => (p.id === presetId ? { ...p, img: base64 } : p)),
          );
        },
        controller.signal,
        CAPTURE_SETTLE_MS,
      );
      notifications.show({
        title: "Captura concluída",
        message: "Todos os presets foram capturados.",
        color: "green",
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        notifications.show({
          title: "Erro na captura automática",
          message: String(err instanceof Error ? err.message : err),
          color: "red",
        });
      }
    } finally {
      setCapturing(false);
      setCaptureProgress(null);
      abortRef.current = null;
    }
  }, []);

  const handleStopCapture = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClearAllImages = useCallback(() => {
    clearAllPresetImages();
    setClearModalOpen(false);
    setPresets((prev) => prev.map((p) => ({ ...p, img: "" })));
  }, []);

  const progressPercent = captureProgress
    ? (captureProgress.current / captureProgress.total) * 100
    : 0;

  const progressLabel = captureProgress
    ? captureProgress.phase === "moving"
      ? `Movendo para preset ${captureProgress.presetId}... (${captureProgress.current}/${captureProgress.total})`
      : `Capturando preset ${captureProgress.presetId}... (${captureProgress.current}/${captureProgress.total})`
    : "";

  return (
    <Container size="lg" py="md">
      <Group justify="flex-end" mb="sm">
        <Button
          color="red"
          variant="light"
          leftSection={<IconTrash size={16} />}
          onClick={() => setClearModalOpen(true)}
          disabled={capturing}
        >
          Limpar capturas
        </Button>
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

      <Modal
        opened={clearModalOpen}
        onClose={() => setClearModalOpen(false)}
        title="Limpar capturas"
        centered
      >
        <Text size="sm" mb="lg">
          Tem certeza que deseja remover todas as imagens salvas? Esta ação não
          pode ser desfeita.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setClearModalOpen(false)}>
            Cancelar
          </Button>
          <Button
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={handleClearAllImages}
          >
            Limpar tudo
          </Button>
        </Group>
      </Modal>

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
