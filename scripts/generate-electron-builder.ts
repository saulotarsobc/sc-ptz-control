import { Configuration } from 'electron-builder';
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { displayName, name, repository } from '../package.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = resolve(__dirname, '..', 'electron-builder.json');

// owner/repo saem do mesmo campo que o scripts/common.ps1 lê. Como este arquivo é
// gerado (e git-ignorado), o `publish` não serve de fonte da verdade para o script
// de release — o package.json serve para os dois, então eles não têm como apontar
// para repositórios diferentes.
const repoMatch = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(repository.url);
if (!repoMatch) {
  throw new Error(`Não consegui extrair owner/repo de "repository.url" (${repository.url}).`);
}
const [, owner, repo] = repoMatch;

const config: Configuration = {
  appId: name,
  productName: displayName,
  files: ['dist/**/*'],
  // Sem este bloco o electron-builder não gera o latest.yml (que o electron-updater
  // baixa de releases/latest/download/) nem embute o app-update.yml no pacote — o
  // app instalado ficaria sem nenhuma forma de saber que existe versão nova.
  publish: [
    {
      provider: 'github',
      owner,
      repo,
      releaseType: 'release',
    },
  ],
  // O sidecar C# (PtzBridge.exe + as 15 DLLs nativas do NetSDK + a ScPtzVCam.dll da câmera
  // virtual) vai solto em resources/ptz-bridge/. Não pode entrar no asar: as DLLs são
  // carregadas por nome do disco pelo LoadLibrary, que não enxerga dentro do pacote.
  extraResources: [
    {
      from: 'native/PtzBridge/publish',
      to: 'ptz-bridge',
      filter: ['**/*'],
    },
  ],
  directories: {
    output: 'out',
  },
  // As dependências de produção são JavaScript puro. Evita uma reinstalação/rebuild
  // síncrona do pnpm durante o empacotamento, que não produz nenhum artefato útil.
  npmRebuild: false,
  // A v6 volta a ser exclusivamente Windows x64: este é o ambiente suportado
  // pelo NetSDK nativo e pela câmera virtual Media Foundation do projeto.
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${name}-${version}-windows-${arch}.${ext}',
  },
  // perMachine é obrigatório: o instalador registra a media source da câmera virtual em
  // HKLM e cria a pasta do buffer de frames em %ProgramData% (ver build/installer.nsh).
  nsis: {
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    oneClick: false,
    include: 'build/installer.nsh',
  },
};

writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log(`✅ JSON generated: ${outputPath}`);
