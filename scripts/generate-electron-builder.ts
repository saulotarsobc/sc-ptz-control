import { Configuration } from "electron-builder";
import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { displayName, name } from "../package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = resolve(__dirname, "..", "electron-builder.json");

const config: Configuration = {
  appId: name,
  productName: displayName,
  files: ["dist/**/*"],
  // O sidecar C# (PtzBridge.exe + as 15 DLLs nativas do NetSDK) vai solto em
  // resources/ptz-bridge/. Não pode entrar no asar: as DLLs são carregadas por nome
  // do disco pelo LoadLibrary, que não enxerga dentro do pacote.
  extraResources: [
    {
      from: "native/PtzBridge/publish",
      to: "ptz-bridge",
      filter: ["**/*"],
    },
  ],
  directories: {
    output: "out",
  },
  // Só Windows x64: o NetSDK da Intelbras é nativo 64-bit e não existe para
  // macOS/Linux, então não há build possível nessas plataformas.
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "${name}-${version}-windows-${arch}.${ext}",
  },
  nsis: {
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    oneClick: false,
  },
};

writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log(`✅ JSON generated: ${outputPath}`);
