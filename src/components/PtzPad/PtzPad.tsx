import type { PtzDirection } from '@/types';
import { ActionIcon, Tooltip } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowDownLeft,
  IconArrowDownRight,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowUpLeft,
  IconArrowUpRight,
  IconHome,
} from '@tabler/icons-react';
import { useCallback, useEffect } from 'react';
import { HoldButton } from './HoldButton';
import classes from './PtzPad.module.css';

type PtzPadProps = {
  onMove: (dir: PtzDirection, stop: boolean) => void;
  onHome: () => void;
  disabled?: boolean;
};

const KEYS: Array<{ dir: PtzDirection; label: string; Icon: typeof IconArrowUp }> = [
  { dir: 'upLeft', label: 'Cima/esquerda', Icon: IconArrowUpLeft },
  { dir: 'up', label: 'Cima', Icon: IconArrowUp },
  { dir: 'upRight', label: 'Cima/direita', Icon: IconArrowUpRight },
  { dir: 'left', label: 'Esquerda', Icon: IconArrowLeft },
  { dir: 'right', label: 'Direita', Icon: IconArrowRight },
  { dir: 'downLeft', label: 'Baixo/esquerda', Icon: IconArrowDownLeft },
  { dir: 'down', label: 'Baixo', Icon: IconArrowDown },
  { dir: 'downRight', label: 'Baixo/direita', Icon: IconArrowDownRight },
];

/** Setas do teclado como atalho para as 4 direções cardeais. */
const ARROW_KEYS: Record<string, PtzDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function PtzPad({ onMove, onHome, disabled = false }: PtzPadProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const dir = ARROW_KEYS[event.key];
      if (!dir || disabled || event.repeat) return;
      // Digitando num campo, as setas movem o cursor — não a câmera.
      if (isTyping(event.target)) return;
      event.preventDefault();
      onMove(dir, false);
    },
    [disabled, onMove],
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      const dir = ARROW_KEYS[event.key];
      if (!dir || isTyping(event.target)) return;
      onMove(dir, true);
    },
    [onMove],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    // Alt+Tab no meio de um movimento não dispara keyup: a janela perdendo foco
    // é o sinal para soltar tudo.
    const releaseAll = () => Object.values(ARROW_KEYS).forEach((dir) => onMove(dir, true));
    window.addEventListener('blur', releaseAll);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, [handleKeyDown, handleKeyUp, onMove]);

  return (
    <div className={classes.pad}>
      {KEYS.slice(0, 4).map(({ dir, label, Icon }) => (
        <PadKey key={dir} dir={dir} label={label} Icon={Icon} onMove={onMove} disabled={disabled} />
      ))}

      <Tooltip label="Ir para a posição inicial" position="top" withArrow openDelay={400}>
        <ActionIcon
          className={classes.key}
          variant="light"
          color="signalBlue"
          radius="md"
          disabled={disabled}
          aria-label="Ir para a posição inicial"
          onClick={onHome}
        >
          <IconHome size={16} stroke={1.6} />
        </ActionIcon>
      </Tooltip>

      {KEYS.slice(4).map(({ dir, label, Icon }) => (
        <PadKey key={dir} dir={dir} label={label} Icon={Icon} onMove={onMove} disabled={disabled} />
      ))}
    </div>
  );
}

function PadKey({
  dir,
  label,
  Icon,
  onMove,
  disabled,
}: {
  dir: PtzDirection;
  label: string;
  Icon: typeof IconArrowUp;
  onMove: (dir: PtzDirection, stop: boolean) => void;
  disabled: boolean;
}) {
  return (
    <HoldButton
      className={classes.key}
      variant="default"
      radius="md"
      disabled={disabled}
      label={label}
      onPress={() => onMove(dir, false)}
      onRelease={() => onMove(dir, true)}
    >
      <Icon size={16} stroke={1.6} />
    </HoldButton>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}
