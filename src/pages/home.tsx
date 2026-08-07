import { useVideoStream } from "@/components/LiveView/useVideoStream";
import { PresetCard } from "@/components/PresetCard/PresetCard";
import { ChannelSelect } from "@/components/PtzPad/ChannelSelect";
import { PtzPanel } from "@/components/PtzPanel/PtzPanel";
import {
  CAPTURE_SETTLE_MS,
  PRESET_SAVE_SETTLE_MS,
  VIDEO_WARMUP_MS,
} from "@/constants";
import { useBridge } from "@/context/BridgeProvider";
import { deleteThumb, putThumb } from "@/services/bridge/api";
import { usePresets } from "@/services/bridge/usePresets";
import { getControlsVisible, setControlsVisible } from "@/services/storage";
import type { VcamStatus } from "@/types";
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
  IconDeviceNintendo,
  IconDeviceNintendoOff,
  IconEraser,
  IconRobot,
  IconRobotOff,
  IconTrash,
  IconVideo,
  IconVideoOff,
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
  const {
    api,
    bridge,
    channel,
    endpoint,
    status,
    restartBridge,
    vcam,
    vcamBusy,
    toggleVcam,
  } = useBridge();
  const { presets, refresh, patch } = usePresets(channel);

  const [controlsOpen, setControlsOpen] = useState(getControlsVisible);

  // Assinatura temporária de vídeo, ligada só enquanto uma captura de miniatura está
  // em curso com os controles escondidos (ver `withVideo`). É contagem, não booleano:
  // dois saves ao mesmo tempo não podem desligar o vídeo um do outro.
  const [videoHold, setVideoHold] = useState(false);
  const holds = useRef(0);

  // Ocultar os controles derruba de verdade a assinatura de vídeo: o canal para de
  // ser decodificado no backend, em vez de só sumir da tela.
  const stream = useVideoStream(
    endpoint,
    channel,
    status.connected && (controlsOpen || videoHold),
  );

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
   * Executa `run` com a imagem ao vivo garantida.
   *
   * Com os controles escondidos não existe assinatura de vídeo, e a miniatura sai do
   * frame que está na tela — então ligamos uma assinatura temporária, esperamos o
   * primeiro frame e a soltamos no fim, para o canal não seguir sendo decodificado à
   * toa. Com os controles à vista não há nada a fazer: o vídeo já está no ar.
   */
  const withVideo = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T> => {
      if (controlsOpen) return run();

      holds.current += 1;
      setVideoHold(true);
      try {
        await stream.waitForFrame(VIDEO_WARMUP_MS);
        return await run();
      } finally {
        holds.current -= 1;
        if (holds.current === 0) setVideoHold(false);
      }
    },
    [controlsOpen, stream],
  );

  /**
   * Captura a miniatura do frame que já está na tela.
   *
   * Bem mais rápido que pedir um snapshot ao equipamento (o `SnapPictureEx` do SDK é
   * assíncrono, limitado a D1 e aceita uma requisição por vez) — em compensação exige
   * o vídeo rodando; quem garante isso é o `withVideo`.
   */
  const captureThumb = useCallback(
    async (preset: number) => {
      if (!endpoint) throw new Error("Serviço de PTZ indisponível.");
      const jpeg = await stream.captureJpeg();
      if (!jpeg) throw new Error("Sem imagem ao vivo para capturar.");
      const rev = await putThumb(
        endpoint.port,
        endpoint.token,
        channel,
        preset,
        jpeg,
      );
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
      // Gravar a posição não depende de nada da tela — só do enlace com o NVR.
      try {
        await api.presetSet(channel, preset);
      } catch (err) {
        notifyError("Erro ao salvar preset", err);
        return;
      }

      try {
        // A miniatura sai do frame ao vivo; com os controles escondidos o `withVideo`
        // liga o vídeo só para esta captura.
        await withVideo(async () => {
          await delay(PRESET_SAVE_SETTLE_MS);
          await captureThumb(preset);
        });
        notifications.show({
          title: "Preset salvo",
          message: `Posição atual gravada no preset ${preset}.`,
          color: "green",
        });
      } catch (err) {
        // A POSIÇÃO já está gravada — falhar só a miniatura é sucesso parcial, não erro.
        notifications.show({
          title: "Preset salvo",
          message: `Posição gravada no preset ${preset}, mas não foi possível capturar a miniatura: ${
            err instanceof Error ? err.message : String(err)
          }`,
          color: "yellow",
        });
      }
    },
    [api, captureThumb, channel, withVideo],
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

        setProgress({
          current: index + 1,
          total,
          preset: preset.n,
          phase: "moving",
        });
        await api.presetGoto(channel, preset.n);
        await delay(CAPTURE_SETTLE_MS, controller.signal);

        setProgress({
          current: index + 1,
          total,
          preset: preset.n,
          phase: "capturing",
        });
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
        .map((preset) =>
          deleteThumb(endpoint.port, endpoint.token, channel, preset.n),
        ),
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
            {/* A câmera virtual segue o canal ativo e independe dos controles estarem à
                vista: quem mantém o vídeo no ar é a assinatura dela no backend. */}
            <Tooltip
              label={vcamHint(vcam, channel)}
              withArrow
              multiline
              w={280}
            >
              <Button
                size="xs"
                variant={vcam?.running ? "filled" : "light"}
                color={vcamColor(vcam)}
                leftSection={
                  vcam?.running ? (
                    <IconVideo size={18} />
                  ) : (
                    <IconVideoOff size={18} />
                  )
                }
                onClick={toggleVcam}
                loading={vcamBusy}
                disabled={capturing || vcam?.supported === false}
              >
                Câmera virtual
              </Button>
            </Tooltip>

            <Button
              size="xs"
              variant={controlsOpen ? "light" : "filled"}
              color="signalBlue"
              leftSection={
                controlsOpen ? (
                  <IconDeviceNintendoOff size={18} />
                ) : (
                  <IconDeviceNintendo size={18} />
                )
              }
              onClick={toggleControls}
              disabled={capturing}
            >
              Controles
            </Button>

            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconEraser size={18} />}
              onClick={() => setClearModal(true)}
              disabled={capturing}
            >
              Limpar
            </Button>

            {capturing ? (
              <Button
                size="xs"
                leftSection={<IconRobotOff size={18} />}
                color="red"
                variant="light"
                onClick={() => abortRef.current?.abort()}
              >
                Parar
              </Button>
            ) : (
              <Tooltip
                label="Mostre os controles: a miniatura é capturada da imagem ao vivo"
                disabled={canCapture}
                withArrow
              >
                <Button
                  size="xs"
                  leftSection={<IconRobot size={18} />}
                  variant="light"
                  onClick={handleCaptureAll}
                  disabled={offline || !canCapture}
                >
                  Capturar
                </Button>
              </Tooltip>
            )}

            {/* O canal vale para a tela inteira — a grade de presets é por canal —,
                por isso fica aqui e não dentro do painel de controle. */}
            <ChannelSelect disabled={capturing} />
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

        {controlsOpen ? (
          <aside className={classes.controls}>
            <PtzPanel stream={stream} busy={capturing} />
          </aside>
        ) : (
          /* O frame só é desenhado se o canvas existir, e a miniatura sai dele. Sem os
             controles à vista ele fica fora da tela, servindo apenas à captura — o
             tráfego só existe enquanto o `withVideo` segura a assinatura. */
          <canvas ref={stream.canvasRef} className={classes.offscreenCanvas} />
        )}
      </div>

      <Modal
        opened={clearModal}
        onClose={() => setClearModal(false)}
        title="Limpar capturas"
        centered
      >
        <Text size="sm" mb="lg">
          Remover todas as miniaturas do canal {channel}? Os presets continuam
          gravados no equipamento — só as imagens são apagadas.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setClearModal(false)}>
            Cancelar
          </Button>
          <Button
            color="red"
            leftSection={<IconEraser size={18} />}
            onClick={handleClearAll}
          >
            Sim, apagar todas
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
          Isso apaga a posição <strong>no equipamento</strong>, junto com o nome
          e a miniatura. Não dá para desfazer.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button
            color="red"
            leftSection={<IconTrash size={18} />}
            onClick={handleDelete}
          >
            Excluir preset
          </Button>
        </Group>
      </Modal>
    </>
  );
}

/** Verde transmitindo, laranja no ar mas sem imagem, neutro desligada. */
function vcamColor(vcam: VcamStatus | null): string | undefined {
  if (!vcam?.running) return undefined;
  return vcam.noSignal ? "orange" : "teal";
}

function vcamHint(vcam: VcamStatus | null, channel: number): string {
  if (vcam?.supported === false) {
    return "A câmera virtual exige Windows 11 (build 22000) ou mais recente.";
  }
  const name = vcam?.name ?? "SC PTZ Virtual Cam";
  if (!vcam?.running) {
    return `Publica o canal ativo como uma webcam chamada "${name}", para usar no OBS, Meet, Teams etc.`;
  }
  return vcam.noSignal
    ? `"${name}" está no ar, mas sem imagem do canal ${vcam.channel}: os outros aplicativos veem o quadro "Sem sinal!".`
    : `Transmitindo o canal ${vcam.channel} em "${name}"${
        vcam.channel === channel ? "" : ` (a tela está no canal ${channel})`
      }.`;
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
