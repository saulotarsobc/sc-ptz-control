import {
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconEdit,
  IconMail,
  IconMapPin,
  IconPhone,
  IconUser,
} from "@tabler/icons-react";

export function ProfilePage() {
  return (
    <Container size="md" py="xl">
      <Group mb="xl">
        <IconUser size={32} />
        <Title order={1}>Profile</Title>
      </Group>

      <Text size="lg" c="dimmed" mb="xl">
        Manage your personal information and account settings.
      </Text>

      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Card.Section style={{ padding: "20px", textAlign: "center" }}>
              <Avatar
                size={120}
                radius="50%"
                style={{ margin: "0 auto 16px" }}
                color="blue"
              >
                SC
              </Avatar>
              <Title order={3}>Saulo Costa</Title>
              <Text c="dimmed" size="sm">
                Software Developer
              </Text>
              <Badge color="green" variant="light" mt="xs">
                Online
              </Badge>
            </Card.Section>

            <Button fullWidth mt="md" leftSection={<IconEdit size={16} />}>
              Edit Profile
            </Button>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={4} mb="md">
                Contact Information
              </Title>
              <Stack gap="sm">
                <Group>
                  <IconMail size={20} color="var(--mantine-color-blue-6)" />
                  <div>
                    <Text size="sm" c="dimmed">
                      Email
                    </Text>
                    <Text>saulotarsobc@gmail.com</Text>
                  </div>
                </Group>
                <Group>
                  <IconPhone size={20} color="var(--mantine-color-green-6)" />
                  <div>
                    <Text size="sm" c="dimmed">
                      Phone
                    </Text>
                    <Text>+55 (11) 99999-9999</Text>
                  </div>
                </Group>
                <Group>
                  <IconMapPin size={20} color="var(--mantine-color-red-6)" />
                  <div>
                    <Text size="sm" c="dimmed">
                      Location
                    </Text>
                    <Text>São Paulo, Brazil</Text>
                  </div>
                </Group>
              </Stack>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={4} mb="md">
                About
              </Title>
              <Text>
                Passionate software developer with expertise in web
                technologies, particularly React, TypeScript, and Node.js.
                Enjoys building cross-platform applications with Electron and
                creating efficient, user-friendly interfaces.
              </Text>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={4} mb="md">
                Skills
              </Title>
              <Group gap="xs">
                {[
                  "React",
                  "TypeScript",
                  "Node.js",
                  "Electron",
                  "Vite",
                  "Mantine",
                ].map((skill) => (
                  <Badge key={skill} variant="light">
                    {skill}
                  </Badge>
                ))}
              </Group>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
