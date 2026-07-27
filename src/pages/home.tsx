import { useVideoStream } from "@/components/LiveView/useVideoStream";
import { PresetCard } from "@/components/PresetCard/PresetCard";
import { PtzPanel } from "@/components/PtzPanel/PtzPanel";
import { CAPTURE_SETTLE_MS, PRESET_SAVE_SETTLE_MS } from "@/constants";
import { useBridge } from "@/context/BridgeProvider";
import { deleteThumb, putThumb } from "@/services/bridge/api";
import { usePresets } from "@/services/bridge/usePresets";
import { getControlsVisible, setControlsVisible } from "@/services/storage";
import {
  Alert,
  Button,
  Group,
  Modal,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCamera,
  IconEye,
  IconEyeOff,
  IconPlayerStop,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";
import classes from "./home.module.css";

type CaptureProgress = {
  current: number;
  total: number;
  preset: number;
  phase: "moving" | "capturing";
};

export function HomePage() {
  const { api, bridge, channel, endpoint, status, restartBridge } = useBridge();
  const { presets, refresh, patch } = usePresets(channel);

  const [controlsOpen, setControlsOpen] = useState(getControlsVisible);

  // Ocultar os controles derruba de verdade a assinatura de vídeo: o canal para de
  // ser decodificado no backend, em vez de só sumir da tela.
  const stream = useVideoStream(endpoint, channel, status.connected && controlsOpen);

  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [clearModal, setClearModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState<CaptureProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const offline = !status.connected;
  const canCapture = stream.state === "live";

  const toggleControls = useCallback(() => {
    setControlsOpen((prev) => {
      setControlsVisible(!prev);
      return !prev;
    });
  }, []);

  /**
   * Captura a miniatura do frame que já está na tela.
   *
   * Bem mais rápido que pedir um snapshot ao equipamento (o `SnapPictureEx` do SDK é
   * assíncrono, limitado a D1 e aceita uma requisição por vez) — em compensação exige
   * o vídeo rodando, ou seja, os controles visíveis.
   */
  const captureThumb = useCallback(
    async (preset: number) => {
      if (!endpoint) throw new Error("Serviço de PTZ indisponível.");
      const jpeg = await stream.captureJpeg();
      if (!jpeg) throw new Error("Sem imagem ao vivo para capturar.");
      const rev = await putThumb(endpoint.port, endpoint.token, channel, preset, jpeg);
      patch(preset, { thumbRev: rev });
    },
    [channel, endpoint, patch, stream],
  );

  const handleGoto = useCallback(
    async (preset: number) => {
      try {
        await api.presetGoto(channel, preset);
        setActivePreset(preset);
      } catch (err) {
        notifyError("Erro ao mover câmera", err);
      }
    },
    [api, channel],
  );

  const handleSave = useCallback(
    async (preset: number) => {
      try {
        await api.presetSet(channel, preset);

        // Sem vídeo não há como capturar a miniatura, mas a POSIÇÃO foi gravada —
        // isso é sucesso parcial, não erro.
        if (!canCapture) {
          notifications.show({
            title: "Preset salvo",
            message: `Posição gravada no preset ${preset}. Mostre os controles para capturar a miniatura.`,
            color: "yellow",
          });
          return;
        }

        await delay(PRESET_SAVE_SETTLE_MS);
        await captureThumb(preset);
        notifications.show({
          title: "Preset salvo",
          message: `Posição atual gravada no preset ${preset}.`,
          color: "green",
        });
      } catch (err) {
        notifyError("Erro ao salvar preset", err);
      }
    },
    [api, canCapture, captureThumb, channel],
  );

  const handleDelete = useCallback(async () => {
    const preset = deleteTarget;
    setDeleteTarget(null);
    if (preset === null) return;

    try {
      // O backend apaga no equipamento e remove a miniatura de uma vez.
      await api.presetDelete(channel, preset);
      patch(preset, { thumbRev: 0 });
      if (activePreset === preset) setActivePreset(null);
      notifications.show({
        title: "Preset excluído",
        message: `O preset ${preset} foi apagado do equipamento.`,
        color: "green",
      });
    } catch (err) {
      notifyError("Erro ao excluir preset", err);
    }
  }, [activePreset, api, channel, deleteTarget, patch]);

  const handleCaptureAll = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setCapturing(true);
    setProgress(null);

    const total = presets.length;
    try {
      for (const [index, preset] of presets.entries()) {
        controller.signal.throwIfAborted();

        setProgress({ current: index + 1, total, preset: preset.n, phase: "moving" });
        await api.presetGoto(channel, preset.n);
        await delay(CAPTURE_SETTLE_MS, controller.signal);

        setProgress({ current: index + 1, total, preset: preset.n, phase: "capturing" });
        // Um preset que não existe no equipamento não move a câmera; a captura ainda
        // funciona, então seguimos em frente em vez de abortar a varredura inteira.
        await captureThumb(preset.n).catch(() => {});
      }

      notifications.show({
        title: "Captura concluída",
        message: "Todas as cenas foram capturadas.",
        color: "green",
      });
    } catch (err) {
      if (!isAbort(err)) notifyError("Erro na captura automática", err);
    } finally {
      setCapturing(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [api, captureThumb, channel, presets]);

  const handleClearAll = useCallback(async () => {
    setClearModal(false);
    if (!endpoint) return;

    await Promise.all(
      presets
        .filter((preset) => preset.thumbRev > 0)
        .map((preset) => deleteThumb(endpoint.port, endpoint.token, channel, preset.n)),
    );
    await refresh();
  }, [channel, endpoint, presets, refresh]);

  if (bridge.status === "failed") {
    return (
      <Stack>
        <Alert
          variant="light"
          color="red"
          title="Serviço de PTZ indisponível"
          icon={<IconAlertTriangle size={16} />}
        >
          <Text size="sm" mb="sm">
            {bridge.error}
          </Text>
          <Button size="xs" variant="light" onClick={restartBridge}>
            Tentar novamente
          </Button>
        </Alert>
      </Stack>
    );
  }

  return (
    <>
      <div className={classes.page}>
        <div className={classes.scenes}>
          <Group className={classes.toolbar} justify="flex-end" gap="xs">
            <Button
              size="xs"
              variant={controlsOpen ? "light" : "filled"}
              color="signalBlue"
              leftSection={controlsOpen ? <IconEyeOff size={15} /> : <IconEye size={15} />}
              onClick={toggleControls}
              disabled={capturing}
            >
              {controlsOpen ? "Ocultar controles" : "Mostrar controles"}
            </Button>

            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconTrash size={15} />}
              onClick={() => setClearModal(true)}
              disabled={capturing}
            >
              Limpar capturas
            </Button>

            {capturing ? (
              <Button
                size="xs"
                leftSection={<IconPlayerStop size={15} />}
                color="red"
                variant="light"
                onClick={() => abortRef.current?.abort()}
              >
                Parar captura
              </Button>
            ) : (
              <Tooltip
                label="Mostre os controles: a miniatura é capturada da imagem ao vivo"
                disabled={canCapture}
                withArrow
              >
                <Button
                  size="xs"
                  leftSection={<IconCamera size={15} />}
                  variant="light"
                  onClick={handleCaptureAll}
                  disabled={offline || !canCapture}
                >
                  Capturar todos
                </Button>
              </Tooltip>
            )}
          </Group>

          {capturing && progress && (
            <div className={classes.progress}>
              <Text size="sm" c="dimmed" mb={4}>
                {progress.phase === "moving"
                  ? `Movendo para preset ${progress.preset}...`
                  : `Capturando preset ${progress.preset}...`}{" "}
                ({progress.current}/{progress.total})
              </Text>
              <Progress
                value={(progress.current / progress.total) * 100}
                size="sm"
                radius="xl"
                animated
              />
            </div>
          )}

          <ScrollArea className={classes.grid} type="auto" offsetScrollbars>
            <SimpleGrid
              cols={{ base: 2, xs: 3, sm: 4, lg: 5, xl: 6 }}
              spacing="sm"
              verticalSpacing="sm"
            >
              {presets.map((preset) => (
                <PresetCard
                  key={preset.n}
                  preset={preset}
                  onGoto={handleGoto}
                  onSave={handleSave}
                  onDelete={setDeleteTarget}
                  isActive={preset.n === activePreset}
                  isCapturing={capturing && progress?.preset === preset.n}
                  disabled={offline}
                />
              ))}
            </SimpleGrid>
          </ScrollArea>
        </div>

        {controlsOpen && (
          <aside className={classes.controls}>
            <PtzPanel stream={stream} busy={capturing} />
          </aside>
        )}
      </div>

      <Modal
        opened={clearModal}
        onClose={() => setClearModal(false)}
        title="Limpar capturas"
        centered
      >
        <Text size="sm" mb="lg">
          Remover todas as miniaturas do canal {channel}? Os presets continuam gravados no
          equipamento — só as imagens são apagadas.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setClearModal(false)}>
            Cancelar
          </Button>
          <Button color="red" leftSection={<IconTrash size={16} />} onClick={handleClearAll}>
            Limpar tudo
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Excluir preset ${deleteTarget ?? ""}`}
        centered
      >
        <Text size="sm" mb="lg">
          Isso apaga a posição <strong>no equipamento</strong>, junto com o nome e a miniatura.
          Não dá para desfazer.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button color="red" leftSection={<IconTrash size={16} />} onClick={handleDelete}>
            Excluir preset
          </Button>
        </Group>
      </Modal>
    </>
  );
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function notifyError(title: string, err: unknown): void {
  notifications.show({
    title,
    message: err instanceof Error ? err.message : String(err),
    color: "red",
  });
}
