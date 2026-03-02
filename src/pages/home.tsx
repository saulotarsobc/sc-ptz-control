import { Container, Group, Stack, Text, Title } from "@mantine/core";
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

      <Stack gap="xl">Stack...</Stack>
    </Container>
  );
}
