import { useBridge } from "@/context/BridgeProvider";
import { Select } from "@mantine/core";
import { IconDeviceCctv } from "@tabler/icons-react";
import { useMemo } from "react";

/**
 * Escolhe o canal ativo. A quantidade vem do login (`channelCount`); antes de conectar
 * mostramos só o canal já configurado, para não inventar uma lista que pode não existir.
 */
export function ChannelSelect({ disabled = false }: { disabled?: boolean }) {
  const { channel, setChannel, status } = useBridge();

  const options = useMemo(() => {
    const total = status.channelCount > 0 ? status.channelCount : channel;
    return Array.from({ length: total }, (_, i) => ({
      value: String(i + 1),
      label: `Canal ${i + 1}`,
    }));
  }, [channel, status.channelCount]);

  return (
    <Select
      size="xs"
      data={options}
      value={String(channel)}
      onChange={(value) => value && setChannel(Number(value))}
      disabled={disabled || options.length <= 1}
      allowDeselect={false}
      leftSection={<IconDeviceCctv size={16} />}
      aria-label="Canal da câmera"
      comboboxProps={{ withinPortal: true }}
    />
  );
}
