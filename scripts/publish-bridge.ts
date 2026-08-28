import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { arch, platform } from 'node:process';

if (platform !== 'win32' || arch !== 'x64') {
  throw new Error(`A v6 do PtzBridge só pode ser publicada no Windows x64; plataforma atual: ${platform}-${arch}.`);
}

const publishDir = resolve('native/PtzBridge/publish');

// `dotnet publish -o` mescla com o conteúdo existente. Limpar impede que DLLs
// obsoletas de uma publicação anterior entrem no instalador.
rmSync(publishDir, { recursive: true, force: true });

const args = [
  'publish',
  'native/PtzBridge/PtzBridge.csproj',
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  '-o',
  publishDir,
];

const result = spawnSync('dotnet', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
