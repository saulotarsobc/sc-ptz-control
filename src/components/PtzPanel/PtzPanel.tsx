import { LiveView } from "@/components/LiveView/LiveView";
import type { VideoStream } from "@/components/LiveView/useVideoStream";
import { AxisControl } from "@/components/PtzPad/AxisControl";
import { ChannelSelect } from "@/components/PtzPad/ChannelSelect";
import { PtzPad } from "@/components/PtzPad/PtzPad";
import { useBridge } from "@/context/BridgeProvider";
import type { PtzDirection } from "@/types";
import { Alert, Card, Group, Slider, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconAperture,
  IconApertureOff,
  IconFocus2,
  IconFocusCentered,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import classes from "./PtzPanel.module.css";

type PtzPanelProps = {
  stream: VideoStream;
  /** Desabilita os controles durante a captura automática. */
  busy?: boolean;
};

/**
 * Painel de operação: imagem ao vivo + cruzeta + zoom/foco/íris + velocidade.
 *
 * O cabeçalho (canal/status) e o aviso de conexão ocupam a largura toda; os três
 * blocos de operação ficam em `.body`, que é uma coluna no painel lateral e uma
 * faixa horizontal quando o painel sobe para cima da grade (ver a CSS).
 */
export function PtzPanel({ stream, busy = false }: PtzPanelProps) {
  const { api, channel, speed, setSpeed, status, config } = useBridge();

  // Rascunho local: o Slider dispara a cada pixel arrastado, e persistir tudo isso
  // seria um config.set por quadro. O valor só é gravado ao soltar.
  const [speedDraft, setSpeedDraft] = useState(speed);
  useEffect(() => setSpeedDraft(speed), [speed]);

  const offline = !status.connected;
  const disabled = offline || busy;

  const move = useCallback(
    (dir: PtzDirection, stop: boolean) => {
      if (offline) return;
      api.move(channel, dir, speed, stop);
    },
    [api, channel, offline, speed],
  );

  const home = useCallback(() => {
    if (offline) return;
    api.presetGoto(channel, config?.homePreset ?? 1).catch(() => {});
  }, [api, channel, config?.homePreset, offline]);

  // Trocar de canal com um eixo pressionado deixaria o motor do canal antigo girando
  // até o watchdog agir — melhor mandar a parada na hora.
  useEffect(() => {
    return () => {
      if (status.connected) api.stopAll(channel);
    };
  }, [api, channel, status.connected]);

  return (
    <Card className={classes.card} padding="xs" withBorder>
      <Group
        className={classes.head}
        justify="space-between"
        gap="xs"
        wrap="nowrap"
      >
        <ChannelSelect disabled={busy} />
        <Text size="xs" c="dimmed" ta="right" truncate>
          {status.connected ? status.serial || "conectado" : "desconectado"}
        </Text>
      </Group>

      {offline && (
        <Alert
          className={classes.head}
          variant="light"
          color="orange"
          icon={<IconAlertTriangle size={14} />}
          p={6}
        >
          <Text size="xs">Sem conexão com o NVR.</Text>
        </Alert>
      )}

      <div className={classes.body}>
        <LiveView stream={stream} className={classes.liveSlot} />

        <div className={classes.padSlot}>
          <PtzPad onMove={move} onHome={home} disabled={disabled} />
        </div>

        <div className={classes.side}>
          <div className={classes.axes}>
            <AxisControl
              label="Zoom"
              minusLabel="Afastar"
              plusLabel="Aproximar"
              MinusIcon={IconZoomOut}
              PlusIcon={IconZoomIn}
              disabled={disabled}
              onChange={(tele, stop) => api.zoom(channel, tele, speed, stop)}
            />

            <AxisControl
              label="Foco"
              minusLabel="Foco perto"
              plusLabel="Foco longe"
              MinusIcon={IconFocus2}
              PlusIcon={IconFocusCentered}
              disabled={disabled}
              onChange={(far, stop) => api.focus(channel, far, speed, stop)}
            />

            <AxisControl
              label="Íris"
              minusLabel="Fechar íris"
              plusLabel="Abrir íris"
              MinusIcon={IconApertureOff}
              PlusIcon={IconAperture}
              disabled={disabled}
              onChange={(open, stop) => api.iris(channel, open, speed, stop)}
            />
          </div>

          <div className={classes.speedRow}>
            <Group justify="space-between" gap="xs" mb={2}>
              <Text size="xs" c="dimmed">
                Velocidade
              </Text>
              <Text size="xs" c="dimmed">
                {speedDraft}
              </Text>
            </Group>
            <Slider
              size="sm"
              min={1}
              max={8}
              step={1}
              value={speedDraft}
              onChange={setSpeedDraft}
              onChangeEnd={setSpeed}
              label={null}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
