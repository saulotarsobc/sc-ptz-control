import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { Route, HashRouter as Router, Routes } from "react-router-dom";
import { AppLayout } from "./components/Layout/AppLayout";
import { BridgeProvider } from "./context/BridgeProvider";
import { HallMapPage } from "./pages/hall-map";
import { HelpPage } from "./pages/help";
import { HomePage } from "./pages/home";
import { SettingsPage } from "./pages/settings";
import theme from "./theme";

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" zIndex={1000} />
      {/* O provider fica FORA do Router: a sessão com o NVR e o canal ativo são
          compartilhados entre as telas e não podem reiniciar a cada navegação. */}
      <BridgeProvider>
        <Router>
          <AppLayout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/hall-map" element={<HallMapPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/help" element={<HelpPage />} />
            </Routes>
          </AppLayout>
        </Router>
      </BridgeProvider>
    </MantineProvider>
  );
}

export default App;
