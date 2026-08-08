import { Group, Text } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import { HoldButton } from './HoldButton';
import classes from './PtzPad.module.css';

type AxisControlProps = {
  label: string;
  /** Rótulos das duas pontas (ex.: "Afastar" / "Aproximar"). */
  minusLabel: string;
  plusLabel: string;
  MinusIcon: Icon;
  PlusIcon: Icon;
  /** `plus` diz qual das duas pontas foi acionada; `stop` marca o soltar. */
  onChange: (plus: boolean, stop: boolean) => void;
  disabled?: boolean;
};

/**
 * Par −/+ de comando contínuo, com a mesma semântica de apertar e soltar do
 * <see cref="PtzPad" />. Reaproveitado por zoom, foco e íris.
 */
export function AxisControl({
  label,
  minusLabel,
  plusLabel,
  MinusIcon,
  PlusIcon,
  onChange,
  disabled = false,
}: AxisControlProps) {
  return (
    <Group className={classes.axis} gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed" className={classes.axisLabel}>
        {label}
      </Text>

      <HoldButton
        className={classes.axisButton}
        variant="default"
        size="md"
        radius="md"
        disabled={disabled}
        label={minusLabel}
        onPress={() => onChange(false, false)}
        onRelease={() => onChange(false, true)}
      >
        <MinusIcon size={16} stroke={1.6} />
      </HoldButton>

      <HoldButton
        className={classes.axisButton}
        variant="default"
        size="md"
        radius="md"
        disabled={disabled}
        label={plusLabel}
        onPress={() => onChange(true, false)}
        onRelease={() => onChange(true, true)}
      >
        <PlusIcon size={16} stroke={1.6} />
      </HoldButton>
    </Group>
  );
}
