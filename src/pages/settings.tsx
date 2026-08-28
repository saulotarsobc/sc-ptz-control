import { PRESET_MAX, PRESET_MIN } from '@/constants';
import { useBridge } from '@/context/BridgeProvider';
import type { DeviceConfigInput } from '@/types';
import {
  Alert,
  Box,
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceCctv,
  IconDeviceFloppy,
  IconNetwork,
  IconReload,
  IconSettings,
  IconUser,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';

type Draft = {
  ip: string;
  port: number;
  user: string;
  password: string;
  channel: number;
  presetCount: number;
  homePreset: number;
  maxVideoWidth: number;
  useSubStream: boolean;
};

type FormErrors = Partial<Record<'ip' | 'user' | 'password' | 'channel', string>>;

type TestResult = { status: 'success' | 'error'; message: string };

/** Larguras de vídeo oferecidas — a altura sempre segue a proporção da fonte. */
const VIDEO_WIDTHS = ['640', '960', '1280'];

export function SettingsPage() {
  const { api, config, link, reloadConfig, connectDevice, status } = useBridge();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (config) setDraft({ ...config, password: '' });
  }, [config]);

  const update = <K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setTestResult(null);
  };

  const validate = useCallback(
    (value: Draft): FormErrors => {
      const next: FormErrors = {};
      if (!value.ip.trim()) next.ip = 'Informe o IP ou host do NVR';
      if (!value.user.trim()) next.user = 'Usuário obrigatório';
      // Só exige senha na primeira vez: depois disso o campo vazio significa
      // "mantenha a que já está salva".
      if (!value.password && !config?.hasPassword) next.password = 'Senha obrigatória';
      if (!Number.isInteger(value.channel) || value.channel < 1) {
        next.channel = 'Canal deve ser um número inteiro ≥ 1';
      }
      return next;
    },
    [config?.hasPassword],
  );

  /** Monta o payload omitindo a senha quando o usuário não digitou uma nova. */
  const toPayload = (value: Draft): DeviceConfigInput => {
    const { password, ...rest } = value;
    return password ? { ...rest, password } : rest;
  };

  const handleSave = useCallback(async () => {
    if (!draft) return;

    const found = validate(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      notifications.show({
        title: 'Dados inválidos',
        message: 'Corrija os erros antes de salvar.',
        color: 'red',
      });
      return;
    }

    setSaving(true);
    try {
      await api.configSet(toPayload(draft));
      await reloadConfig();
      notifications.show({
        title: 'Configurações salvas',
        message: 'O serviço reconecta automaticamente se os dados de acesso mudaram.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err) {
      notifications.show({
        title: 'Erro ao salvar',
        message: err instanceof Error ? err.message : String(err),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  }, [api, draft, reloadConfig, validate]);

  const handleTest = useCallback(async () => {
    if (!draft) return;

    const found = validate(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      // O teste grava antes de logar: o backend usa a configuração salva, e assim o
      // "Testar" não pode aprovar dados diferentes dos que ficarão valendo.
      await api.configSet(toPayload(draft));
      await connectDevice();
      const current = await api.status();
      setTestResult({
        status: 'success',
        message: `${current.channelCount} canal(is) disponível(is)${
          current.serial ? ` — série ${current.serial}` : ''
        }.`,
      });
      await reloadConfig();
    } catch (err) {
      setTestResult({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }, [api, connectDevice, draft, reloadConfig, validate]);

  if (link !== 'open' || !draft) {
    return (
      <Container size="md" py="xl">
        <Alert variant="light" color="orange" icon={<IconAlertTriangle size={16} />}>
          Aguardando o serviço de PTZ...
        </Alert>
      </Container>
    );
  }

  const maxChannel = status.channelCount > 0 ? status.channelCount : undefined;

  return (
    <Container size="md" py="xl">
      <Group mb="md">
        <IconSettings size={28} stroke={1.4} />
        <Title order={2}>Configurações</Title>
      </Group>

      <Text size="sm" c="dimmed" mb="lg">
        Endereço e credenciais do NVR/DVR. A senha é guardada cifrada pelo sistema no serviço local — nunca no
        navegador.
      </Text>

      <Stack gap="lg">
        <Card padding="lg" withBorder>
          <Group mb="md">
            <IconNetwork size={20} />
            <Title order={4}>Conexão do Dispositivo</Title>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Endereço"
              description="IP ou host do NVR/DVR"
              placeholder="192.168.1.108"
              value={draft.ip}
              error={errors.ip}
              onChange={(e) => update('ip', e.currentTarget.value)}
              leftSection={<IconNetwork size={18} />}
            />

            <NumberInput
              label="Porta"
              description="Porta do protocolo do SDK — normalmente 37777"
              placeholder="37777"
              min={1}
              max={65535}
              value={draft.port}
              onChange={(value) => update('port', Number(value) || 0)}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
            <TextInput
              label="Usuário"
              description="Usuário ativo no NVR"
              placeholder="admin"
              value={draft.user}
              error={errors.user}
              onChange={(e) => update('user', e.currentTarget.value)}
              leftSection={<IconUser size={18} />}
            />

            <PasswordInput
              label="Senha"
              description={config?.hasPassword ? 'Deixe em branco para manter a senha atual' : undefined}
              placeholder={config?.hasPassword ? '••••••' : 'Senha de acesso'}
              value={draft.password}
              error={errors.password}
              onChange={(e) => update('password', e.currentTarget.value)}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
            <NumberInput
              label="Canal"
              description={maxChannel ? `O dispositivo tem ${maxChannel} canal(is)` : 'Canal da câmera PTZ'}
              min={1}
              max={maxChannel}
              value={draft.channel}
              error={errors.channel}
              onChange={(value) => update('channel', Number(value) || 0)}
              leftSection={<IconDeviceCctv size={18} />}
            />

            <NumberInput
              label="Preset inicial"
              description="Para onde o botão de casa do controle leva"
              min={1}
              value={draft.homePreset}
              onChange={(value) => update('homePreset', Number(value) || 1)}
            />
          </SimpleGrid>
        </Card>

        <Card padding="lg" withBorder>
          <Group mb="md">
            <IconDeviceCctv size={20} />
            <Title order={4}>Vídeo e presets</Title>
          </Group>

          <Stack gap="md">
            <div>
              <Text size="sm" fw={500}>
                Quantidade de presets
              </Text>
              <Text size="xs" c="dimmed" mb="xs">
                {draft.presetCount} presets ({PRESET_MIN}–{PRESET_MAX})
              </Text>
              <Slider
                min={PRESET_MIN}
                max={PRESET_MAX}
                step={1}
                value={draft.presetCount}
                onChange={(value) => update('presetCount', value)}
                marks={[
                  { value: PRESET_MIN, label: String(PRESET_MIN) },
                  { value: PRESET_MAX, label: String(PRESET_MAX) },
                ]}
                mb="sm"
              />
            </div>

            <div>
              <Text size="sm" fw={500}>
                Largura do vídeo
              </Text>
              <Text size="xs" c="dimmed" mb="xs">
                A altura acompanha a proporção da fonte. Larguras maiores gastam mais CPU.
              </Text>
              <SegmentedControl
                data={VIDEO_WIDTHS}
                value={String(draft.maxVideoWidth)}
                onChange={(value) => update('maxVideoWidth', Number(value))}
              />
            </div>

            <Switch
              label="Usar stream extra (sub-stream)"
              description="Menor resolução e menos rede, à custa de qualidade. Deixe desligado para usar o stream principal."
              checked={draft.useSubStream}
              onChange={(e) => update('useSubStream', e.currentTarget.checked)}
            />
          </Stack>
        </Card>

        {testResult && (
          <Alert
            variant="light"
            color={testResult.status === 'success' ? 'green' : 'red'}
            title={testResult.status === 'success' ? 'Conexão estabelecida' : 'Falha na conexão'}
            icon={testResult.status === 'success' ? <IconCheck size={16} /> : <IconX size={16} />}
            withCloseButton
            onClose={() => setTestResult(null)}
          >
            <Text size="sm">{testResult.message}</Text>
          </Alert>
        )}

        <Group justify="space-between">
          <Button
            variant="light"
            color="signalBlue"
            leftSection={<IconNetwork size={18} />}
            loading={testing}
            loaderProps={{ type: 'dots' }}
            onClick={handleTest}
          >
            Testar conexão
          </Button>

          <Group>
            <Button
              variant="light"
              color="yellow"
              leftSection={<IconReload size={18} />}
              onClick={() => {
                if (config) setDraft({ ...config, password: '' });
                setErrors({});
                setTestResult(null);
              }}
            >
              Desfazer
            </Button>
            <Button leftSection={<IconDeviceFloppy size={18} />} loading={saving} onClick={handleSave}>
              Salvar
            </Button>
          </Group>
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
