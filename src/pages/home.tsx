import { Welcome } from "@/components/Welcome/Welcome";
import { Card, Container, Group, Stack, Text, Title } from "@mantine/core";
import { IconHome } from "@tabler/icons-react";

export function HomePage() {
  return (
    <Container size="lg" py="xl">
      <Group mb="xl">
        <IconHome size={32} />
        <Title order={1}>Home</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Welcome to your Electron + Vite application with Mantine UI and AppShell
        layout.
      </Text>

      <Stack gap="xl">
        {/* Welcome section */}
        <Welcome />

        {/* Info Cards */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={4} mb="md">
            🚀 Features
          </Title>
          <Stack gap="sm">
            <Text>✨ Modern UI with Mantine components</Text>
            <Text>⚡ Fast development with Vite and HMR</Text>
            <Text>🎨 Custom theme toggle with smooth animations</Text>
            <Text>📱 Responsive AppShell layout with collapsible navbar</Text>
            <Text>🔄 Multiple pages demonstrating routing</Text>
            <Text>💻 Cross-platform Electron application</Text>
          </Stack>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={4} mb="md">
            📚 Navigation
          </Title>
          <Text mb="sm">Use the sidebar to explore different pages:</Text>
          <Stack gap="xs">
            <Text size="sm">
              • <strong>Gallery</strong> - Image gallery with cards
            </Text>
            <Text size="sm">
              • <strong>Messages</strong> - Contact list interface
            </Text>
            <Text size="sm">
              • <strong>Search</strong> - Search with filtering
            </Text>
            <Text size="sm">
              • <strong>Profile</strong> - User profile page
            </Text>
            <Text size="sm">
              • <strong>Settings</strong> - Application settings
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
