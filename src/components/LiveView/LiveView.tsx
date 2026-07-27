import { Badge, Loader, Text } from "@mantine/core";
import { IconAlertTriangle, IconVideoOff } from "@tabler/icons-react";
import type { VideoStream } from "./useVideoStream";
import classes from "./LiveView.module.css";

type LiveViewProps = {
  stream: VideoStream;
  /** Permite ao contêiner controlar como a telinha se comporta no layout (encolher, etc.). */
  className?: string;
};

/**
 * A telinha ao vivo. O canvas é dimensionado pelo próprio stream e a CSS cuida da
 * escala — o hook só desenha.
 */
export function LiveView({ stream, className }: LiveViewProps) {
  const { canvasRef, state, error, width, height } = stream;
  const hasImage = state === "live" || state === "stalled";

  return (
    <div className={`${classes.viewport} ${className ?? ""}`}>
      {state === "live" && (
        <Badge className={classes.badge} color="red" variant="filled" size="sm">
          AO VIVO
        </Badge>
      )}
      {state === "stalled" && (
        <Badge className={classes.badge} color="orange" variant="filled" size="sm">
          PARADO
        </Badge>
      )}

      <canvas
        ref={canvasRef}
        className={`${classes.canvas} ${hasImage ? "" : classes.canvasHidden}`}
      />

      {hasImage && width > 0 && (
        <Text size="xs" className={classes.resolution}>
          {width}×{height}
        </Text>
      )}

      {!hasImage && (
        <div className={classes.overlay}>
          {state === "connecting" && (
            <>
              <Loader size="sm" color="gray" />
              <Text size="sm">Conectando ao vídeo...</Text>
            </>
          )}

          {state === "idle" && (
            <>
              <IconVideoOff size={32} stroke={1.2} />
              <Text size="sm">Sem vídeo</Text>
            </>
          )}

          {state === "error" && (
            <>
              <IconAlertTriangle size={32} stroke={1.2} color="var(--mantine-color-orange-5)" />
              <Text size="sm">{error ?? "Não foi possível abrir o vídeo."}</Text>
            </>
          )}
        </div>
      )}
    </div>
  );
}
