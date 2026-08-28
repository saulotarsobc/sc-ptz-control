import { Container, MantineProvider, Skeleton, Stack } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { lazy, Suspense } from 'react';
import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import { AppLayout } from './components/Layout/AppLayout';
import { BridgeProvider } from './context/BridgeProvider';
import { HomePage } from './pages/home';
import theme from './theme';

// A tela operacional principal fica no bundle inicial. As telas secundárias só
// são carregadas quando o operador as abre, reduzindo o trabalho no startup.
const HallMapPage = lazy(() => import('./pages/hall-map').then((module) => ({ default: module.HallMapPage })));
const HelpPage = lazy(() => import('./pages/help').then((module) => ({ default: module.HelpPage })));
const SettingsPage = lazy(() => import('./pages/settings').then((module) => ({ default: module.SettingsPage })));

function PageSkeleton() {
  return (
    <Container size="md" py="xl" aria-label="Carregando tela">
      <Stack gap="md">
        <Skeleton height={32} width="42%" />
        <Skeleton height={112} />
        <Skeleton height={112} />
      </Stack>
    </Container>
  );
}

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" zIndex={1000} />
      {/* O provider fica FORA do Router: a sessão com o NVR e o canal ativo são
          compartilhados entre as telas e não podem reiniciar a cada navegação. */}
      <BridgeProvider>
        <Router>
          <AppLayout>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/hall-map" element={<HallMapPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/help" element={<HelpPage />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </Router>
      </BridgeProvider>
    </MantineProvider>
  );
}

export default App;
