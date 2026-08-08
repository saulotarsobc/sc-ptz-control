import { ActionIcon, Tooltip, type ActionIconProps } from '@mantine/core';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/** Intervalo de re-arme. Metade do watchdog do backend (1200 ms), com folga de sobra. */
const REARM_MS = 500;

type HoldButtonProps = ActionIconProps & {
  /** Chamado ao apertar E a cada re-arme enquanto segurar. */
  onPress: () => void;
  /** Chamado ao soltar — inclusive por perda de foco ou desmontagem. */
  onRelease: () => void;
  label: string;
  children: ReactNode;
};

/**
 * Botão de comando contínuo: aperta e segura para mover, solta para parar.
 *
 * Usa captura de ponteiro, então o "soltar" chega mesmo se o cursor sair do botão
 * no meio do movimento — com `mouseleave` a câmera continuaria girando. Além disso
 * re-arma o comando periodicamente para o watchdog do backend saber que ainda há
 * alguém segurando; se esta janela travar, a câmera para sozinha em ~1,2 s.
 */
export function HoldButton({ onPress, onRelease, label, children, ...actionIconProps }: HoldButtonProps) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldRef = useRef(false);

  const release = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    onRelease();
  }, [onRelease]);

  const press = useCallback(() => {
    if (heldRef.current) return;
    heldRef.current = true;
    onPress();
    timerRef.current = setInterval(onPress, REARM_MS);
  }, [onPress]);

  // Desmontar com o botão apertado (troca de página, por exemplo) precisa soltar.
  useEffect(() => release, [release]);

  return (
    <Tooltip label={label} position="top" withArrow openDelay={400}>
      <ActionIcon
        {...actionIconProps}
        aria-label={label}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onBlur={release}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (!e.repeat) press();
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') release();
        }}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}
