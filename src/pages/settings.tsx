import { PRESET_MAX, PRESET_MIN } from "@/constants";
import { getDeviceConfig, setDeviceConfig } from "@/services/storage";
import type { DeviceConfig } from "@/types";
import {
  Box,
  Button,
  Card,
  Container,
  Group,
  PasswordInput,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconDeviceFloppy,
  IconNetwork,
  IconReload,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import { useCallback, useState } from "react";

interface FormErrors {
  device?: string;
  username?: string;
  password?: string;
  channel?: string;
}

function validate(config: DeviceConfig): FormErrors {
  const errors: FormErrors = {};
  if (!/^[\w.-]+(:\d{1,5})?$/.test(config.device.trim())) {
    errors.device = "Formato inválido. Use IP:porta (ex: 10.0.0.2:80)";
  }
  if (!config.username.trim()) {
    errors.username = "Usuário obrigatório";
  }
  if (!config.password.trim()) {
    errors.password = "Senha obrigatória";
  }
  if (!Number.isInteger(config.channel) || config.channel < 1) {
    errors.channel = "Canal deve ser um número inteiro ≥ 1";
  }
  return errors;
}

export function SettingsPage() {
  const [config, setConfig] = useState<DeviceConfig>(() => getDeviceConfig());
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSave = useCallback(() => {
    const errs = validate(config);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      notifications.show({
        title: "Dados inválidos",
        message: "Corrija os erros antes de salvar.",
        color: "red",
      });
      return;
    }
    setErrors({});
    setDeviceConfig(config);
    notifications.show({
      title: "Configurações salvas",
      message: "DVR/NVR atualizado com sucesso.",
      color: "green",
      icon: <IconCheck size={16} />,
    });
  }, [config]);

  const handleReset = useCallback(() => {
    setConfig(getDeviceConfig());
    setErrors({});
  }, []);

  const updateField = (field: keyof DeviceConfig, value: string | number) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Container size="md" py="xl">
      <Group mb="md">
        <IconSettings size={28} stroke={1.4} />
        <Title order={2}>Configurações</Title>
      </Group>

      <Text size="sm" c="dimmed" mb="lg">
        Configure o endereço do DVR/NVR e as credenciais de acesso para
        controlar a câmera PTZ.
      </Text>

      <Stack gap="lg">
        {/* Conexão do Dispositivo */}
        <Card padding="lg" withBorder>
          <Group mb="md">
            <IconNetwork size={20} />
            <Title order={4}>Conexão do Dispositivo</Title>
          </Group>

          {/* Endereço do dispositivo e canal */}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Endereço do dispositivo"
              description="IP e porta do DVR/NVR (ex: 10.0.0.2:80)"
              placeholder="10.0.0.2:80"
              value={config.device}
              error={errors.device}
              onChange={(e) => updateField("device", e.currentTarget.value)}
              leftSection={<IconNetwork size={16} />}
            />

            <TextInput
              label="Canal"
              description="Número do canal da câmera PTZ"
              placeholder="1"
              value={String(config.channel)}
              error={errors.channel}
              onChange={(e) => {
                const val = parseInt(e.currentTarget.value, 10);
                updateField("channel", isNaN(val) ? 0 : val);
              }}
            />
          </SimpleGrid>

          {/* Autenticação */}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Usuário"
              description="Nome de usuário do DVR/NVR"
              placeholder="admin"
              value={config.username}
              error={errors.username}
              onChange={(e) => updateField("username", e.currentTarget.value)}
              leftSection={<IconUser size={16} />}
            />

            <PasswordInput
              label="Senha"
              description="Senha de acesso ao DVR/NVR"
              placeholder="••••••"
              value={config.password}
              error={errors.password}
              onChange={(e) => updateField("password", e.currentTarget.value)}
            />
          </SimpleGrid>

          {/* Presets */}
          <SimpleGrid cols={{ base: 1 }}>
            <div style={{ marginTop: 6 }}>
              <Text size="sm" fw={500}>
                Quantidade de presets
              </Text>

              <Text size="xs" c="dimmed" mb="xs">
                {config.totalPresets} presets ({PRESET_MIN}–{PRESET_MAX})
              </Text>

              <Slider
                min={PRESET_MIN}
                max={PRESET_MAX}
                step={1}
                value={config.totalPresets}
                onChange={(val) => updateField("totalPresets", val)}
                marks={[
                  { value: PRESET_MIN, label: String(PRESET_MIN) },
                  { value: PRESET_MAX, label: String(PRESET_MAX) },
                ]}
                mb="sm"
              />
            </div>
          </SimpleGrid>
        </Card>

        {/* Action Buttons */}
        <Group justify="flex-end">
          <Button
            variant="light"
            color="yellow"
            leftSection={<IconReload size={16} />}
            onClick={handleReset}
          >
            Desfazer
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
          >
            Salvar
          </Button>
        </Group>
      </Stack>

      <Box p="xs">
        <Text size="xs" c="dimmed">
          © 2026 Saulo Costa
        </Text>
      </Box>
    </Container>
  );
}
