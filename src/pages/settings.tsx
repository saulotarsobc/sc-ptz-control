import {
  Button,
  Card,
  Container,
  Divider,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBell,
  IconDownload,
  IconPalette,
  IconSettings,
  IconShield,
} from "@tabler/icons-react";

export function SettingsPage() {
  return (
    <Container size="md" py="xl">
      <Group mb="xl">
        <IconSettings size={32} />
        <Title order={1}>Settings</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Customize your application preferences and behavior.
      </Text>

      <Stack gap="lg">
        {/* Appearance Settings */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconPalette size={20} />
            <Title order={4}>Appearance</Title>
          </Group>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text>Dark mode</Text>
                <Text size="sm" c="dimmed">
                  Use dark theme
                </Text>
              </div>
              <Switch />
            </Group>
            <Group justify="space-between">
              <div>
                <Text>Color scheme</Text>
                <Text size="sm" c="dimmed">
                  Choose your preferred color
                </Text>
              </div>
              <Select
                data={["Blue", "Green", "Red", "Orange", "Purple"]}
                defaultValue="Blue"
                w={120}
              />
            </Group>
          </Stack>
        </Card>

        {/* Notifications */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconBell size={20} />
            <Title order={4}>Notifications</Title>
          </Group>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text>Push notifications</Text>
                <Text size="sm" c="dimmed">
                  Receive push notifications
                </Text>
              </div>
              <Switch defaultChecked />
            </Group>
            <Group justify="space-between">
              <div>
                <Text>Email notifications</Text>
                <Text size="sm" c="dimmed">
                  Receive email updates
                </Text>
              </div>
              <Switch />
            </Group>
            <Group justify="space-between">
              <div>
                <Text>Sound notifications</Text>
                <Text size="sm" c="dimmed">
                  Play sound for notifications
                </Text>
              </div>
              <Switch defaultChecked />
            </Group>
          </Stack>
        </Card>

        {/* Privacy & Security */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconShield size={20} />
            <Title order={4}>Privacy & Security</Title>
          </Group>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text>Two-factor authentication</Text>
                <Text size="sm" c="dimmed">
                  Add an extra layer of security
                </Text>
              </div>
              <Button variant="light" size="xs">
                Enable
              </Button>
            </Group>
            <Group justify="space-between">
              <div>
                <Text>Activity status</Text>
                <Text size="sm" c="dimmed">
                  Show when you're online
                </Text>
              </div>
              <Switch defaultChecked />
            </Group>
          </Stack>
        </Card>

        {/* Data & Storage */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group mb="md">
            <IconDownload size={20} />
            <Title order={4}>Data & Storage</Title>
          </Group>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text>Auto-download media</Text>
                <Text size="sm" c="dimmed">
                  Automatically download images and files
                </Text>
              </div>
              <Switch />
            </Group>
            <Group justify="space-between">
              <div>
                <Text>Storage location</Text>
                <Text size="sm" c="dimmed">
                  Choose where files are saved
                </Text>
              </div>
              <Button variant="light" size="xs">
                Change
              </Button>
            </Group>
          </Stack>
        </Card>

        <Divider />

        {/* Action Buttons */}
        <Group justify="flex-end">
          <Button variant="light">Reset to defaults</Button>
          <Button>Save changes</Button>
        </Group>
      </Stack>
    </Container>
  );
}
