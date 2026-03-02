import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const packageJsonPath = join(__dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const nodeVersion = process.version.split("v")[1];

const dependencies = {
  NodeJS: nodeVersion,
  ElectronJS: packageJson.devDependencies.electron,
  "Electron Builder": packageJson.devDependencies["electron-builder"],
  TypeScript: packageJson.devDependencies.typescript,
  ReactJS: packageJson.dependencies.react,
};

const badgeColors = {
  ElectronJS: "46816e",
  "Electron Builder": "blue",
  NodeJS: "44883e",
  TypeScript: "blue",
  NextJS: "black",
  ReactJS: "61DAFB",
} as Record<string, string>;

const badges = Object.entries(dependencies).map(([name, version]) => {
  if (typeof version === "string") {
    return ` <img alt="static badge from ${name.toLocaleLowerCase()}" src="https://img.shields.io/badge/${name.replace(
      / /g,
      "%20"
    )}-v${version.replace("^", "")}-${badgeColors[name]}">`;
  }
  return ` <img alt="static badge from ${name.toLocaleLowerCase()}" src="https://img.shields.io/badge/${name.replace(
    / /g,
    "%20"
  )}-vN/A-${badgeColors[name]}">`;
});

const badgesString = `<div align="center">\n${badges.join("\n")}\n</div>`;

console.log(badgesString);

const readmePath = join(__dirname, "../README.md");
const readmeContent = readFileSync(readmePath, "utf-8");

const badgeStart = "<!-- Badge Start -->";
const badgeEnd = "<!-- Badge End -->";

const updatedReadmeContent = readmeContent.replace(
  new RegExp(`${badgeStart}[\\s\\S]*?${badgeEnd}`),
  `${badgeStart}\n${badgesString}\n${badgeEnd}`
);

writeFileSync(readmePath, updatedReadmeContent, "utf-8");
