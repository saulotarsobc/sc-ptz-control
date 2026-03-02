import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  build: {
    outDir: "dist/frontend",
    assetsDir: ".",
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
      renderer: process.env.NODE_ENV === "test" ? undefined : {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
