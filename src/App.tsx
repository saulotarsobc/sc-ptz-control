import { MantineProvider } from "@mantine/core";
import { Route, HashRouter as Router, Routes } from "react-router-dom";
import { AppLayout } from "./components/Layout/AppLayout";
import { HallMapPage } from "./pages/hall-map";
import { HomePage } from "./pages/home";
import { SettingsPage } from "./pages/settings";
import theme from "./theme";

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/hall-map" element={<HallMapPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppLayout>
      </Router>
    </MantineProvider>
  );
}

export default App;
