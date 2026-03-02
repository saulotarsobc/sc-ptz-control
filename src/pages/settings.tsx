import { PRESET_MAX, PRESET_MIN } from "@/constants";
import {
  clearAllPresetImages,
  getDeviceConfig,
  setDeviceConfig,
} from "@/services/storage";
import type { DeviceConfig } from "@/types";
import {
  Box,
  Button,
  Card,
  Container,
  Group,
  Modal,
  PasswordInput,
  SimpleGrid,
  Slider,
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
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

export function SettingsPage() {
  const [config, setConfig] = useState<DeviceConfig>({
    device: "",
    username: "",
    password: "",
    channel: "",
    totalPresets: PRESET_MIN,
  });
  const [saved, setSaved] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);

  const handleClearAllImages = useCallback(() => {
    clearAllPresetImages();
    setClearModalOpen(false);
  }, []);

  const loadConfig = useCallback(() => {
    const data = getDeviceConfig();
    setConfig(data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const updateField = (field: keyof DeviceConfig, value: string | number) => {
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
        {/* Conexão do Dispositivo */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
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
          </SimpleGrid>

          {/* Autenticação */}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
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

        {/* Gerenciamento de capturas */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconTrash size={20} />
            <Title order={4}>Capturas</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            Remove todas as imagens de prévia salvas nos presets.
          </Text>
          <Button
            color="red"
            variant="light"
            leftSection={<IconTrash size={16} />}
            onClick={() => setClearModalOpen(true)}
          >
            Limpar todas as capturas
          </Button>
        </Card>

        <Modal
          opened={clearModalOpen}
          onClose={() => setClearModalOpen(false)}
          title="Limpar capturas"
          centered
        >
          <Text size="sm" mb="lg">
            Tem certeza que deseja remover todas as imagens salvas? Esta ação
            não pode ser desfeita.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setClearModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={handleClearAllImages}
            >
              Limpar tudo
            </Button>
          </Group>
        </Modal>

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
