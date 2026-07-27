import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  build: {
    outDir: "dist/frontend",
    assetsDir: ".",
  },
  server: {
    watch: {
      // O MSBuild cria e apaga temporários em obj/ o tempo todo; sem isso um
      // `dotnet build` rodando em paralelo derruba o dev server com ENOENT.
      ignored: ["**/native/**", "**/out/**"],
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: "backend/main.ts",
        vite: {
          build: {
            outDir: "dist/backend",
          },
        },
      },
      preload: {
        input: path.join(__dirname, "backend/preload.ts"),
        vite: {
          build: {
            outDir: "dist/backend",
          },
        },
      },
      renderer: undefined,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
