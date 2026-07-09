import type { Preset } from "@/types";
import { ActionIcon, Card, Center, Text, Tooltip } from "@mantine/core";
import {
  IconCameraOff,
  IconDeviceFloppy,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { memo, useCallback, useState } from "react";
import classes from "./PresetCard.module.css";

interface PresetCardProps {
  preset: Preset;
  onGotoPreset: (presetId: number) => Promise<void>;
  onSetPreset: (presetId: number) => Promise<void>;
  onDeleteImage: (presetId: number) => void;
  isCapturing?: boolean;
  isActive?: boolean;
}

export const PresetCard = memo(function PresetCard({
  preset,
  onGotoPreset,
  onSetPreset,
  onDeleteImage,
  isCapturing = false,
  isActive = false,
}: PresetCardProps) {
  const hasImage = preset.img !== "";
  const [gotoLoading, setGotoLoading] = useState(false);
  const [setLoading, setSetLoading] = useState(false);

  const handleGoto = useCallback(async () => {
    setGotoLoading(true);
    try {
      await onGotoPreset(preset.id);
    } finally {
      setGotoLoading(false);
    }
  }, [onGotoPreset, preset.id]);

  const handleSet = useCallback(async () => {
    setSetLoading(true);
    try {
      await onSetPreset(preset.id);
    } finally {
      setSetLoading(false);
    }
  }, [onSetPreset, preset.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleGoto();
      }
    },
    [handleGoto],
  );

  const classNames = [
    classes.card,
    isCapturing ? classes.capturing : "",
    isCapturing ? classes.cardDisabled : "",
    isActive && !isCapturing ? classes.active : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Card
      className={classNames}
      padding={0}
      radius="md"
      withBorder
      onClick={isCapturing ? undefined : handleGoto}
      onKeyDown={isCapturing ? undefined : handleKeyDown}
      tabIndex={isCapturing ? -1 : 0}
      role="button"
      aria-label={`Preset ${preset.id}${hasImage ? "" : " — sem imagem"}${isActive ? " — ativo" : ""}`}
      aria-busy={isCapturing}
      aria-current={isActive ? "true" : undefined}
    >
      {/* Preset number badge */}
      <div
        className={`${classes.presetBadge} ${isActive && !isCapturing ? classes.presetBadgeActive : ""}`}
      >
        {preset.id}
      </div>

      {/* Active indicator dot */}
      {isActive && !isCapturing && (
        <Tooltip label="Posição atual" position="top" withArrow>
          <div className={classes.activeDot}>
            <span className={classes.activeDotPulse} />
          </div>
        </Tooltip>
      )}

      {/* Preset image or placeholder */}
      <div className={classes.imageWrapper}>
        {hasImage ? (
          <img
            className={classes.presetImage}
            src={preset.img}
            alt={`Preset ${preset.id}`}
            draggable={false}
            loading="lazy"
          />
        ) : (
          <Center h="100%">
            <div style={{ textAlign: "center" }}>
              <IconCameraOff
                size={28}
                stroke={1.2}
                color="var(--mantine-color-dimmed)"
              />
              <Text size="xs" c="dimmed" mt={4}>
                Sem imagem
              </Text>
            </div>
          </Center>
        )}
      </div>

      {/* Action buttons (visible on hover) */}
      <div className={classes.actions} onClick={(e) => e.stopPropagation()}>
        <Tooltip label="Ir para preset" position="top" withArrow>
          <ActionIcon
            variant="filled"
            color="signalBlue"
            size="md"
            loading={gotoLoading}
            onClick={handleGoto}
          >
            <IconPlayerPlay size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Salvar posição atual" position="top" withArrow>
          <ActionIcon
            variant="filled"
            color="yellow"
            size="md"
            loading={setLoading}
            onClick={handleSet}
          >
            <IconDeviceFloppy size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Remover imagem" position="top" withArrow>
          <ActionIcon
            variant="filled"
            color="red"
            size="md"
            onClick={() => onDeleteImage(preset.id)}
          >
            <IconCameraOff size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </Card>
  );
});
