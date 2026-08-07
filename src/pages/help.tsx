import {
  Card,
  Container,
  Divider,
  Group,
  Kbd,
  List,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArmchair,
  IconBulb,
  IconCamera,
  IconCameraOff,
  IconDeviceFloppy,
  IconDragDrop,
  IconInfoCircle,
  IconPhotoScan,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconSettings,
  IconX,
} from "@tabler/icons-react";

const sections = [
  {
    icon: IconInfoCircle,
    title: "Sobre o SC PTZ Control",
    color: "signalBlue",
    content: (
      <Text size="sm" c="dimmed" lh={1.7}>
        O SC PTZ Control é uma ferramenta de desktop para controlar câmeras PTZ
        (Pan-Tilt-Zoom) conectadas a um DVR/NVR Intelbras. Ele foi desenvolvido
        para ajudar equipes de áudio e vídeo em congregações a gerenciar
        posições de câmera durante reuniões ao vivo.
      </Text>
    ),
  },
  {
    icon: IconSettings,
    title: "1. Configuração Inicial",
    color: "yellow",
    content: (
      <Stack gap="sm">
        <Text size="sm" c="dimmed" lh={1.7}>
          Antes de usar o app, configure a conexão com seu DVR/NVR na página de{" "}
          <Text span inherit fw={600}>
            Configurações
          </Text>
          .
        </Text>
        <List spacing="xs" size="sm" c="dimmed">
          <List.Item>
            <Text span inherit fw={500}>
              Endereço do dispositivo:
            </Text>{" "}
            IP e porta do DVR/NVR (ex: <Kbd>10.0.0.2:37777</Kbd>)
          </List.Item>
          <List.Item>
            <Text span inherit fw={500}>
              Canal:
            </Text>{" "}
            Número do canal onde a câmera PTZ está conectada
          </List.Item>
          <List.Item>
            <Text span inherit fw={500}>
              Usuário e senha:
            </Text>{" "}
            Credenciais de acesso ao DVR/NVR
          </List.Item>
          <List.Item>
            <Text span inherit fw={500}>
              Quantidade de presets:
            </Text>{" "}
            De 24 a 100 posições programáveis
          </List.Item>
        </List>
        <Text size="sm" c="dimmed" lh={1.7}>
          Após salvar as configurações, o app estará pronto para uso. O cache de
          autenticação é renovado automaticamente.
        </Text>
      </Stack>
    ),
  },
  {
    icon: IconCamera,
    title: "2. Página de Presets",
    color: "signalBlue",
    content: (
      <Stack gap="sm">
        <Text size="sm" c="dimmed" lh={1.7}>
          A página inicial exibe uma grade com todos os presets configurados.
          Cada card representa uma posição programável da câmera.
        </Text>

        <Divider label="Ações" labelPosition="left" size="xs" />

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="signalBlue" size="sm" radius="xl" variant="light">
            <IconPlayerPlay size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Ir para preset:
            </Text>{" "}
            Clique no card ou no botão Play. A câmera move-se para a posição
            salva. O preset ativo fica destacado com borda Signal Blue e um
            ponto pulsante.
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="yellow" size="sm" radius="xl" variant="light">
            <IconDeviceFloppy size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Salvar posição atual:
            </Text>{" "}
            Clique no botão Salvar (ícone de disquete). A câmera captura um
            snapshot da posição atual e o associa ao preset.
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="red" size="sm" radius="xl" variant="light">
            <IconCameraOff size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Remover imagem:
            </Text>{" "}
            Limpa o snapshot do preset sem apagar a posição programada.
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="signalBlue" size="sm" radius="xl" variant="light">
            <IconPhotoScan size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Capturar:
            </Text>{" "}
            Percorre automaticamente todos os presets, movendo a câmera e
            capturando snapshots um a um. Use o botão{" "}
            <Text span inherit fw={600}>
              Parar
            </Text>{" "}
            para interromper.
          </Text>
        </Group>

        <Divider label="Dica" labelPosition="left" size="xs" />

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="signalBlue" size="sm" radius="xl" variant="light">
            <IconBulb size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            Use os botões Play e Salvar em conjunto: primeiro salve a posição
            atual em um preset, depois teste movendo para outro e voltando.
          </Text>
        </Group>
      </Stack>
    ),
  },
  {
    icon: IconArmchair,
    title: "3. Mapa do Salão",
    color: "signalBlue",
    content: (
      <Stack gap="sm">
        <Text size="sm" c="dimmed" lh={1.7}>
          O Mapa do Salão permite associar presets de câmera a assentos
          específicos no auditório, organizados em grupos (A, B, C) com fileiras
          e assentos.
        </Text>

        <Divider label="Como usar" labelPosition="left" size="xs" />

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="signalBlue" size="sm" radius="xl" variant="light">
            <IconDragDrop size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Atribuir preset:
            </Text>{" "}
            Arraste um preset da lista lateral para o assento desejado no mapa.
            O assento ocupado fica com borda sólida Signal Blue.
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="signalBlue" size="sm" radius="xl" variant="light">
            <IconPlayerTrackNext size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Ir para preset:
            </Text>{" "}
            Clique em um assento ocupado para mover a câmera para a posição
            daquele preset.
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="red" size="sm" radius="xl" variant="light">
            <IconX size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Remover preset:
            </Text>{" "}
            Passe o mouse sobre o assento ocupado e clique no botão ✕ no canto
            superior direito.
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap" align="flex-start">
          <ThemeIcon color="signalBlue" size="sm" radius="xl" variant="light">
            <IconDragDrop size={12} />
          </ThemeIcon>
          <Text size="sm" c="dimmed" lh={1.6}>
            <Text span inherit fw={600}>
              Reatribuir:
            </Text>{" "}
            Arraste um preset de um assento já ocupado para outro assento para
            movê-lo de lugar.
          </Text>
        </Group>
      </Stack>
    ),
  },
  {
    icon: IconBulb,
    title: "4. Dicas e Atalhos",
    color: "yellow",
    content: (
      <Stack gap="sm">
        <List spacing="xs" size="sm" c="dimmed">
          <List.Item
            icon={
              <ThemeIcon
                color="signalBlue"
                size={16}
                radius="xl"
                variant="light"
              >
                <IconBulb size={10} />
              </ThemeIcon>
            }
          >
            <Text span inherit fw={500}>
              Presets visuais:
            </Text>{" "}
            Capture snapshots dos presets após configurá-los. As imagens ajudam
            a identificar rapidamente cada posição da câmera.
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon
                color="signalBlue"
                size={16}
                radius="xl"
                variant="light"
              >
                <IconBulb size={10} />
              </ThemeIcon>
            }
          >
            <Text span inherit fw={500}>
              Organização no Mapa do Salão:
            </Text>{" "}
            Associe cada preset a um assento específico para saber exatamente
            para onde a câmera vai apontar ao clicar.
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon
                color="signalBlue"
                size={16}
                radius="xl"
                variant="light"
              >
                <IconBulb size={10} />
              </ThemeIcon>
            }
          >
            <Text span inherit fw={500}>
              Tema escuro:
            </Text>{" "}
            O app usa tema escuro por padrão para conforto visual durante
            reuniões com pouca luz. Use o botão de sol/lua no cabeçalho para
            alternar para o tema claro.
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon
                color="signalBlue"
                size={16}
                radius="xl"
                variant="light"
              >
                <IconBulb size={10} />
              </ThemeIcon>
            }
          >
            <Text span inherit fw={500}>
              Teclado:
            </Text>{" "}
            Use <Kbd>Tab</Kbd> para navegar entre os cards de preset e{" "}
            <Kbd>Enter</Kbd> ou <Kbd>Espaço</Kbd> para ativar.
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon color="yellow" size={16} radius="xl" variant="light">
                <IconBulb size={10} />
              </ThemeIcon>
            }
          >
            <Text span inherit fw={500}>
              Cuidado com limites:
            </Text>{" "}
            Cada fabricante tem um limite máximo de presets. Consulte o manual
            do seu DVR/NVR antes de configurar acima de 50 presets.
          </List.Item>
        </List>
      </Stack>
    ),
  },
];

export function HelpPage() {
  return (
    <Container size="md" py="xl">
      <Group mb="md">
        <IconInfoCircle size={28} stroke={1.4} />
        <Title order={2}>Ajuda</Title>
      </Group>

      <Text size="sm" c="dimmed" mb="lg">
        Instruções e dicas para usar o SC PTZ Control.
      </Text>

      <Stack gap="md">
        {sections.map((section) => (
          <Card key={section.title} padding="lg" withBorder>
            <Group mb="sm">
              <ThemeIcon
                color={section.color as "signalBlue" | "yellow" | "red"}
                size="md"
                radius="md"
                variant="light"
              >
                <section.icon size={18} />
              </ThemeIcon>
              <Title order={4}>{section.title}</Title>
            </Group>
            {section.content}
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
