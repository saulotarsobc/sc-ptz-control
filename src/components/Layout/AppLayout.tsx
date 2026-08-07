import { ColorSchemeToggle } from "@/components/ColorSchemeToggle/ColorSchemeToggle";
import { UpdateBanner } from "@/components/UpdateBanner/UpdateBanner";
import { useUpdateStatus } from "@/components/UpdateBanner/useUpdateStatus";
import {
  ActionIcon,
  AppShell,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArmchair,
  IconBrandGithub,
  IconCamera,
  IconHelp,
  IconSettings,
} from "@tabler/icons-react";
import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import classes from "./AppLayout.module.css";

interface AppLayoutProps {
  children: ReactNode;
}

const navigationLinks = [
  { icon: IconCamera, label: "Presets", path: "/" },
  { icon: IconArmchair, label: "Mapa do Salão", path: "/hall-map" },
  { icon: IconSettings, label: "Configurações", path: "/settings" },
  { icon: IconHelp, label: "Ajuda", path: "/help" },
];

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const updateStatus = useUpdateStatus();

  return (
    <AppShell
      header={{
        height: 60,
      }}
      navbar={{
        width: 30,
        breakpoint: 0,
      }}
      // O rodapé só existe quando há atualização em andamento; `collapsed` é o
      // que devolve a altura ao conteúdo no resto do tempo.
      footer={{
        height: 48,
        collapsed: !updateStatus,
      }}
      padding="md"
    >
      {/* Header */}
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
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
        <AppShell.Section grow>
          <ScrollArea scrollbars="y" h="100%">
            <Stack gap="0" align="center" justify="center">
              {navigationLinks.map((link) => (
                <Tooltip
                  label={link.label}
                  position="right"
                  withArrow
                  key={link.path}
                >
                  <NavLink
                    p={5}
                    m={0}
                    w={30}
                    href="#"
                    leftSection={<link.icon size={20} stroke={1.5} />}
                    active={location.pathname === link.path}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(link.path);
                    }}
                    variant="filled"
                  />
                </Tooltip>
              ))}
            </Stack>
          </ScrollArea>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Main Content */}
      <AppShell.Main>
        <div key={location.key} className={classes.pageTransition}>
          {children}
        </div>
      </AppShell.Main>

      {/* Atualização automática */}
      {updateStatus && (
        <AppShell.Footer>
          <UpdateBanner status={updateStatus} />
        </AppShell.Footer>
      )}
    </AppShell>
  );
}
