import type { Preset } from "@/types";
import { ActionIcon, Card, Center, Text, Tooltip } from "@mantine/core";
import {
  IconCameraOff,
  IconDeviceFloppy,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { memo, useState } from "react";
import classes from "./PresetCard.module.css";

interface PresetCardProps {
  preset: Preset;
  onGotoPreset: (presetId: number) => Promise<void>;
  onSetPreset: (presetId: number) => Promise<void>;
  onDeleteImage: (presetId: number) => void;
  isCapturing?: boolean;
}

export const PresetCard = memo(function PresetCard({
  preset,
  onGotoPreset,
  onSetPreset,
  onDeleteImage,
  isCapturing = false,
}: PresetCardProps) {
  const hasImage = preset.img !== "";
  const [gotoLoading, setGotoLoading] = useState(false);
  const [setLoading, setSetLoading] = useState(false);

  const handleGoto = async () => {
    setGotoLoading(true);
    try {
      await onGotoPreset(preset.id);
    } finally {
      setGotoLoading(false);
    }
  };

  const handleSet = async () => {
    setSetLoading(true);
    try {
      await onSetPreset(preset.id);
    } finally {
      setSetLoading(false);
    }
  };

  return (
    <Card
      className={`${classes.card} ${isCapturing ? classes.capturing : ""}`}
      padding={0}
      radius="md"
      withBorder
      onClick={handleGoto}
      style={{ cursor: "pointer" }}
    >
      {/* Preset number badge */}
      <div className={classes.presetBadge}>{preset.id}</div>

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
            color="blue"
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
