import { AppLayout } from "@/components/Layout";
import { MantineProvider } from "@mantine/core";
import { Route, HashRouter as Router, Routes } from "react-router-dom";
import { GalleryPage } from "./pages/gallery";
import { HomePage } from "./pages/home";
import { MessagesPage } from "./pages/messages";
import { ProfilePage } from "./pages/profile";
import { SearchPage } from "./pages/search";
import { SettingsPage } from "./pages/settings";
import theme from "./theme";

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppLayout>
      </Router>
    </MantineProvider>
  );
}

export default App;
