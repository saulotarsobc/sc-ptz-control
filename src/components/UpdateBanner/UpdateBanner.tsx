import type { UpdateStatus } from "@/types";
import { Button, Group, Progress, Text } from "@mantine/core";
import { IconDownload, IconRefreshAlert } from "@tabler/icons-react";

interface UpdateBannerProps {
  status: UpdateStatus;
}

/**
 * Faixa no rodapé com o andamento da atualização. Só o estado "downloaded" pede
 * ação — os outros são informativos e não interrompem quem está operando a câmera.
 */
export function UpdateBanner({ status }: UpdateBannerProps) {
  return (
    <Group h="100%" px="md" gap="sm" wrap="nowrap">
      {status.state === "available" && (
        <>
          <IconDownload size={18} stroke={1.5} />
          <Text size="sm">
            Nova versão {status.version} encontrada, baixando…
          </Text>
        </>
      )}

      {status.state === "downloading" && (
        <>
          <IconDownload size={18} stroke={1.5} />
          <Text size="sm">
            Baixando atualização… {Math.round(status.percent)}%
          </Text>
          <Progress
            value={status.percent}
            w={160}
            size="sm"
            aria-label="Progresso do download da atualização"
          />
        </>
      )}

      {status.state === "downloaded" && (
        <>
          <IconRefreshAlert size={18} stroke={1.5} />
          <Text size="sm">Versão {status.version} pronta para instalar.</Text>
          {/* O instalador é perMachine (registra a câmera virtual em HKLM), então
              o Windows vai pedir confirmação do UAC depois que o app fechar. */}
          <Button size="xs" onClick={() => window.ptz.installUpdate()}>
            Reiniciar e instalar
          </Button>
        </>
      )}
    </Group>
  );
}
