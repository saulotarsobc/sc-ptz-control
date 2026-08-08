import type { PresetView } from '@/services/bridge/usePresets';
import { ActionIcon, Card, Center, Text, Tooltip } from '@mantine/core';
import { IconCameraOff, IconDeviceFloppy, IconPlayerPlay, IconTrash } from '@tabler/icons-react';
import { memo, useCallback, useState } from 'react';
import classes from './PresetCard.module.css';

interface PresetCardProps {
  preset: PresetView;
  onGoto: (n: number) => Promise<void>;
  /** Grava a posição atual no preset e captura a miniatura. */
  onSave: (n: number) => Promise<void>;
  /** Pede a exclusão — a confirmação é do chamador. */
  onDelete: (n: number) => void;
  isCapturing?: boolean;
  isActive?: boolean;
  disabled?: boolean;
}

export const PresetCard = memo(function PresetCard({
  preset,
  onGoto,
  onSave,
  onDelete,
  isCapturing = false,
  isActive = false,
  disabled = false,
}: PresetCardProps) {
  const [gotoLoading, setGotoLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleGoto();
      }
    },
    [handleGoto],
  );

  const classNames = [
    classes.card,
    isCapturing ? classes.capturing : '',
    inert ? classes.cardDisabled : '',
    isActive && !isCapturing ? classes.active : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card
      className={classNames}
      padding={0}
      radius="md"
      withBorder
      onClick={inert ? undefined : handleGoto}
      onKeyDown={inert ? undefined : handleKeyDown}
      tabIndex={inert ? -1 : 0}
      role="button"
      aria-label={`Preset ${preset.n}${preset.thumbUrl ? '' : ' — sem imagem'}${isActive ? ' — ativo' : ''}`}
      aria-busy={isCapturing}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className={`${classes.presetBadge} ${isActive && !isCapturing ? classes.presetBadgeActive : ''}`}>
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
            <div style={{ textAlign: 'center' }}>
              <IconCameraOff size={28} stroke={1.2} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" mt={4}>
                Sem imagem
              </Text>
            </div>
          </Center>
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

        <Tooltip label="Excluir preset do equipamento" position="top" withArrow>
          <ActionIcon variant="filled" color="red" size="md" disabled={disabled} onClick={() => onDelete(preset.n)}>
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </Card>
  );
});
