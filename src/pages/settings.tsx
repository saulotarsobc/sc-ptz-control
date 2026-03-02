import type { DeviceConfig } from "@/types";
import {
  Alert,
  Box,
  Button,
  Card,
  Container,
  Group,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      if (!window.api) {
        setError("API não disponível. Execute dentro do Electron.");
        setLoading(false);
        return;
      }
      const data = await window.api.GetDeviceConfigs();
      setConfig(data);
      setError(null);
    } catch {
      setError("Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = useCallback(async () => {
    if (!window.api) return;
    setSaving(true);
    try {
      await window.api.SetDeviceConfigs(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleReset = useCallback(() => {
    loadConfig();
  }, [loadConfig]);

  const updateField = (field: keyof DeviceConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  if (loading) {
    return (
      <Container size="md" py="xl">
        <Group justify="center" py="xl">
          <Loader size="lg" />
        </Group>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="md" py="xl">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Erro"
          color="red"
          variant="light"
        >
          {error}
        </Alert>
      </Container>
    );
  }

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
            loading={saving}
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
