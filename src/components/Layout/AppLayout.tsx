import { ColorSchemeToggle } from "@/components/ColorSchemeToggle/ColorSchemeToggle";
import {
  ActionIcon,
  AppShell,
  Box,
  Burger,
  Divider,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBrandGithub,
  IconHome,
  IconMessageCircle,
  IconPhoto,
  IconSearch,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface AppLayoutProps {
  children: ReactNode;
}

const navigationLinks = [
  { icon: IconHome, label: "Home", path: "/" },
  { icon: IconPhoto, label: "Gallery", path: "/gallery" },
  { icon: IconMessageCircle, label: "Messages", path: "/messages" },
  { icon: IconSearch, label: "Search", path: "/search" },
  { icon: IconUser, label: "Profile", path: "/profile" },
  { icon: IconSettings, label: "Settings", path: "/settings" },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 300, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      {/* Header */}
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Title order={3}>Electron + Vite</Title>
          </Group>

          <Group>
            <ColorSchemeToggle />
            <ActionIcon
              variant="light"
              size="lg"
              component="a"
              href="https://github.com/saulotarsobc"
              target="_blank"
            >
              <IconBrandGithub size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      {/* Navbar */}
      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" mb="md">
            Navigation
          </Text>
        </AppShell.Section>

        <AppShell.Section grow component={ScrollArea}>
          <Stack gap="xs">
            {navigationLinks.map((link) => (
              <NavLink
                key={link.path}
                href="#"
                label={link.label}
                leftSection={<link.icon size={20} stroke={1.5} />}
                active={location.pathname === link.path}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.path);
                  if (opened) toggle(); // Close mobile menu after navigation
                }}
                variant="filled"
              />
            ))}
          </Stack>

          <Divider my="md" />

          <Text size="xs" c="dimmed" mb="xs">
            Demo Links (Scroll Test)
          </Text>
          {Array(20)
            .fill(0)
            .map((_, index) => (
              <NavLink
                href="#"
                key={index}
                onClick={(event) => event.preventDefault()}
                label={`Demo link ${index + 1}`}
                disabled
                mb={4}
              />
            ))}
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="md" />
          <Box p="xs" style={{ textAlign: "center" }}>
            <Text size="xs" c="dimmed">
              Electron + React + Vite
            </Text>
            <Text size="xs" c="dimmed">
              © 2025 Saulo Costa
            </Text>
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Main Content */}
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
