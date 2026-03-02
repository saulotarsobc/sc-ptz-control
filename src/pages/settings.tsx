import { getDeviceConfig, setDeviceConfig } from "@/services/storage";
import type { DeviceConfig } from "@/types";
import {
  Box,
  Button,
  Card,
  Container,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconDeviceFloppy,
  IconNetwork,
  IconReload,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

export function SettingsPage() {
  const [config, setConfig] = useState<DeviceConfig>({
    device: "",
    username: "",
    password: "",
    channel: "",
  });
  const [saved, setSaved] = useState(false);

  const loadConfig = useCallback(() => {
    const data = getDeviceConfig();
    setConfig(data);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = useCallback(() => {
    setDeviceConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [config]);

  const handleReset = useCallback(() => {
    loadConfig();
  }, [loadConfig]);

  const updateField = (field: keyof DeviceConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  return (
    <Container size="md" py="xl">
      <Group mb="xl">
        <IconSettings size={28} />
        <Title order={2}>Configurações</Title>
      </Group>

      <Text size="sm" c="dimmed" mb="lg">
        Configure o endereço do DVR/NVR e as credenciais de acesso para
        controlar a câmera PTZ.
      </Text>

      <Stack gap="lg">
        {/* Device Connection */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconNetwork size={20} />
            <Title order={4}>Conexão do Dispositivo</Title>
          </Group>

          <Stack gap="md">
            <TextInput
              label="Endereço do dispositivo"
              description="IP e porta do DVR/NVR (ex: 10.0.0.2:80)"
              placeholder="10.0.0.2:80"
              value={config.device}
              onChange={(e) => updateField("device", e.currentTarget.value)}
              leftSection={<IconNetwork size={16} />}
            />

            <TextInput
              label="Canal"
              description="Número do canal da câmera PTZ"
              placeholder="1"
              value={config.channel}
              onChange={(e) => updateField("channel", e.currentTarget.value)}
            />
          </Stack>
        </Card>

        {/* Authentication */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconUser size={20} />
            <Title order={4}>Autenticação</Title>
          </Group>

          <Stack gap="md">
            <TextInput
              label="Usuário"
              description="Nome de usuário do DVR/NVR"
              placeholder="admin"
              value={config.username}
              onChange={(e) => updateField("username", e.currentTarget.value)}
              leftSection={<IconUser size={16} />}
            />

            <PasswordInput
              label="Senha"
              description="Senha de acesso ao DVR/NVR"
              placeholder="••••••"
              value={config.password}
              onChange={(e) => updateField("password", e.currentTarget.value)}
            />
          </Stack>
        </Card>

        {/* Action Buttons */}
        <Group justify="flex-end">
          <Button
            variant="light"
            color="yellow"
            leftSection={<IconReload size={16} />}
            onClick={handleReset}
          >
            Redefinir
          </Button>
          <Button
            color={saved ? "green" : "blue"}
            leftSection={
              saved ? <IconCheck size={16} /> : <IconDeviceFloppy size={16} />
            }
            onClick={handleSave}
          >
            {saved ? "Salvo!" : "Salvar"}
          </Button>
        </Group>
      </Stack>

      <Box p="xs">
        <Text size="xs" c="dimmed">
          © {new Date().getFullYear()} Saulo Costa
        </Text>
      </Box>
    </Container>
  );
}
