import type { Preset } from "@/types";
import { ActionIcon, Card, Center, Text, Tooltip } from "@mantine/core";
import {
  IconCamera,
  IconCameraOff,
  IconDeviceFloppy,
  IconPlayerPlay,
} from "@tabler/icons-react";
import classes from "./PresetCard.module.css";

interface PresetCardProps {
  preset: Preset;
  onGotoPreset: (presetId: number) => void;
  onSetPreset: (presetId: number) => void;
  onDeleteImage: (presetId: number) => void;
}

export function PresetCard({
  preset,
  onGotoPreset,
  onSetPreset,
  onDeleteImage,
}: PresetCardProps) {
  const hasImage = preset.img !== "";

  return (
    <Card
      className={classes.card}
      padding={0}
      radius="md"
      withBorder
      onClick={() => onGotoPreset(preset.id)}
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
          />
        ) : (
          <Center h="100%">
            <div style={{ textAlign: "center" }}>
              <IconCamera
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
            size="sm"
            onClick={() => onGotoPreset(preset.id)}
          >
            <IconPlayerPlay size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Salvar posição atual" position="top" withArrow>
          <ActionIcon
            variant="filled"
            color="yellow"
            size="sm"
            onClick={() => onSetPreset(preset.id)}
          >
            <IconDeviceFloppy size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Remover imagem" position="top" withArrow>
          <ActionIcon
            variant="filled"
            color="red"
            size="sm"
            onClick={() => onDeleteImage(preset.id)}
          >
            <IconCameraOff size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </Card>
  );
}
