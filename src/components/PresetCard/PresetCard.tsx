import type { PresetView } from "@/services/bridge/usePresets";
import { ActionIcon, Center, Text, TextInput, Tooltip } from "@mantine/core";
import { Card } from "@mantine/core";
import {
  IconCameraOff,
  IconDeviceFloppy,
  IconPencil,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react";
import { memo, useCallback, useEffect, useState } from "react";
import classes from "./PresetCard.module.css";

interface PresetCardProps {
  preset: PresetView;
  onGoto: (n: number) => Promise<void>;
  /** Grava a posição atual no preset e captura a miniatura. */
  onSave: (n: number) => Promise<void>;
  /** Pede a exclusão — a confirmação é do chamador. */
  onDelete: (n: number) => void;
  onRename: (n: number, name: string) => Promise<void>;
  isCapturing?: boolean;
  isActive?: boolean;
  disabled?: boolean;
}

export const PresetCard = memo(function PresetCard({
  preset,
  onGoto,
  onSave,
  onDelete,
  onRename,
  isCapturing = false,
  isActive = false,
  disabled = false,
}: PresetCardProps) {
  const [gotoLoading, setGotoLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(preset.name);

  useEffect(() => setDraft(preset.name), [preset.name]);

  const inert = isCapturing || disabled;

  const handleGoto = useCallback(async () => {
    if (inert) return;
    setGotoLoading(true);
    try {
      await onGoto(preset.n);
    } finally {
      setGotoLoading(false);
    }
  }, [inert, onGoto, preset.n]);

  const handleSave = useCallback(async () => {
    setSaveLoading(true);
    try {
      await onSave(preset.n);
    } finally {
      setSaveLoading(false);
    }
  }, [onSave, preset.n]);

  const commitName = useCallback(async () => {
    setEditing(false);
    const name = draft.trim();
    if (name === preset.name) return;
    await onRename(preset.n, name).catch(() => setDraft(preset.name));
  }, [draft, onRename, preset.name, preset.n]);

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
    inert ? classes.cardDisabled : "",
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
      onClick={inert || editing ? undefined : handleGoto}
      onKeyDown={inert || editing ? undefined : handleKeyDown}
      tabIndex={inert || editing ? -1 : 0}
      role="button"
      aria-label={`Preset ${preset.n}${preset.name ? ` — ${preset.name}` : ""}${
        preset.thumbUrl ? "" : " — sem imagem"
      }${isActive ? " — ativo" : ""}`}
      aria-busy={isCapturing}
      aria-current={isActive ? "true" : undefined}
    >
      <div
        className={`${classes.presetBadge} ${
          isActive && !isCapturing ? classes.presetBadgeActive : ""
        }`}
      >
        {preset.n}
      </div>

      {isActive && !isCapturing && (
        <Tooltip label="Posição atual" position="top" withArrow>
          <div className={classes.activeDot}>
            <span className={classes.activeDotPulse} />
          </div>
        </Tooltip>
      )}

      <div className={classes.imageWrapper}>
        {preset.thumbUrl ? (
          <img
            className={classes.presetImage}
            src={preset.thumbUrl}
            alt={`Preset ${preset.n}`}
            draggable={false}
            loading="lazy"
          />
        ) : (
          <Center h="100%">
            <div style={{ textAlign: "center" }}>
              <IconCameraOff size={28} stroke={1.2} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" mt={4}>
                Sem imagem
              </Text>
            </div>
          </Center>
        )}
      </div>

      <div className={classes.footer} onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <TextInput
            size="xs"
            variant="unstyled"
            autoFocus
            value={draft}
            placeholder="Nome do preset"
            maxLength={40}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraft(preset.name);
                setEditing(false);
              }
            }}
            aria-label={`Nome do preset ${preset.n}`}
          />
        ) : (
          <Text size="xs" c={preset.name ? undefined : "dimmed"} truncate>
            {preset.name || "Sem nome"}
          </Text>
        )}
      </div>

      <div className={classes.actions} onClick={(e) => e.stopPropagation()}>
        <Tooltip label="Ir para preset" position="top" withArrow>
          <ActionIcon
            variant="filled"
            color="signalBlue"
            size="md"
            loading={gotoLoading}
            disabled={disabled}
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
            loading={saveLoading}
            disabled={disabled}
            onClick={handleSave}
          >
            <IconDeviceFloppy size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Renomear" position="top" withArrow>
          <ActionIcon variant="filled" color="gray" size="md" onClick={() => setEditing(true)}>
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Excluir preset do equipamento" position="top" withArrow>
          <ActionIcon
            variant="filled"
            color="red"
            size="md"
            disabled={disabled}
            onClick={() => onDelete(preset.n)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </Card>
  );
});
