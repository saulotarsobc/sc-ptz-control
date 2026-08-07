import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import electron from "vite-plugin-electron/simple";

/**
 * Mantém pacotes fora do bundle do processo principal, resolvidos de node_modules
 * em tempo de execução.
 *
 * É um plugin em vez de `build.rollupOptions.external` de propósito: o
 * vite-plugin-electron lê `rolldownOptions` no Vite 8 e `rollupOptions` no Vite 7,
 * e a chave que não corresponde à versão em uso é descartada em silêncio — o
 * pacote voltaria para dentro do bundle sem nenhum aviso. O `resolveId` funciona
 * nos dois casos.
 */
function externalize(...ids: string[]): Plugin {
  return {
    name: "sc-ptz:externalize",
    // "pre" é obrigatório: sem isso o resolvedor do Vite já teria transformado o
    // especificador num caminho de arquivo antes deste hook rodar.
    enforce: "pre",
    resolveId: (source) =>
      ids.includes(source) ? { id: source, external: true } : undefined,
  };
}

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
          // O electron-updater precisa ir para o pacote como dependência de
          // produção, não embutido: ele carrega o updater da plataforma com
          // `require` dinâmico e lê o app-update.yml de resources/. O
          // electron-builder copia as dependências de produção mesmo com o
          // `files` restrito a dist/**, então basta não empacotá-lo aqui.
          plugins: [externalize("electron-updater")],
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
