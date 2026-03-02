import {
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconDeviceFloppy,
  IconDownload,
  IconFiles,
  IconPalette,
  IconReload,
  IconSettings,
} from "@tabler/icons-react";

export function SettingsPage() {
  return (
    <Container size="md" py="xl">
      <Group mb="xl">
        <IconSettings size={32} />
        <Title order={1}>Configurações</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Personalize as preferências e o comportamento do seu aplicativo.
      </Text>

      <Stack gap="lg">
        {/* Appearance Settings */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconPalette size={20} />
            <Title order={4}>Aparência</Title>
          </Group>

          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text>Esquema de cores</Text>
                <Text size="xs" c="dimmed">
                  Escolha sua cor preferida
                </Text>
              </div>
              <Select
                variant="filled"
                data={["Blue", "Green", "Red", "Orange", "Purple"]}
                defaultValue="Blue"
                unselectable="off"
              />
            </Group>
          </Stack>
        </Card>

        {/* Data & Storage */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconDownload size={20} />
            <Title order={4}>Dados & Armazenamento</Title>
          </Group>

          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text>Local de armazenamento</Text>
                <Text size="xs" c="dimmed">
                  Escolha aonde salvar as capturas
                </Text>
              </div>
              <Button color="blue" leftSection={<IconFiles size={16} />}>
                Alterar local
              </Button>
            </Group>
          </Stack>
        </Card>

        <Divider />

        {/* Action Buttons */}
        <Group justify="flex-end">
          <Button color="yellow" leftSection={<IconReload size={16} />}>
            Redefinir
          </Button>
          <Button color="green" leftSection={<IconDeviceFloppy size={16} />}>
            Salvar
          </Button>
        </Group>
      </Stack>

      <Box
        p="xs"
        style={{
          textAlign: "left",
          position: "absolute",
          bottom: 0,
          right: 10,
        }}
      >
        <Text size="xs" c="dimmed">
          © {new Date().getFullYear()} Saulo Costa
        </Text>
      </Box>
    </Container>
  );
}
