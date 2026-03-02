import { ColorSchemeToggle } from "@/components/ColorSchemeToggle/ColorSchemeToggle";
import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconBrandGithub, IconHome, IconSettings } from "@tabler/icons-react";
import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface AppLayoutProps {
  children: ReactNode;
}

const navigationLinks = [
  { icon: IconHome, label: "Inicio", path: "/" },
  { icon: IconSettings, label: "Configurações", path: "/settings" },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppShell
      header={{
        height: 60,
      }}
      navbar={{
        width: 30,
        breakpoint: "sm",
        collapsed: {
          mobile: !opened,
        },
      }}
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
            <Title order={3}>SC PTZ Control</Title>
          </Group>

          <Group>
            <ColorSchemeToggle />
            {/* TODO: Abrir link do repositório no sistema */}
            <ActionIcon
              variant="light"
              size="lg"
              component="a"
              href="https://github.com/saulotarsobc/sc-ptz-control"
              target="_blank"
            >
              <IconBrandGithub size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      {/* Navbar */}
      <AppShell.Navbar p="0">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap="0" align="center" justify="center">
            {navigationLinks.map((link) => (
              // TODO: Usar cor do tema para o link ativo
              <NavLink
                p={5}
                m={0}
                w={30}
                key={link.path}
                href="#"
                // label={link.label}
                leftSection={<link.icon size={20} stroke={1.5} />}
                active={location.pathname === link.path}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.path);
                  if (opened) toggle();
                }}
                variant="filled"
              />
            ))}
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Main Content */}
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
