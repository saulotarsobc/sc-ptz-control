import { Configuration } from "electron-builder";
import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { displayName } from "../package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: Configuration = {
  appId: "br.com.saulotarsobc.electron-with-vite",
  productName: displayName,
  files: ["dist/**/*"],
  directories: {
    output: "out",
  },
  win: {
    target: ["nsis"],
    artifactName: "${name}-${version}-windows-${arch}.${ext}",
  },
  nsis: {
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    oneClick: false,
  },
  mac: {
    target: "dmg",
    signIgnore: null,
    artifactName: "${productName}-Setup-${version}.${ext}",
  },
  linux: {
    target: ["AppImage", "deb"],
    artifactName: "${name}-${version}-linux-${arch}.${ext}",
  },
};

const outputPath = resolve(__dirname, "..", "electron-builder.json");

writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log(`✅ JSON generated: ${outputPath}`);
