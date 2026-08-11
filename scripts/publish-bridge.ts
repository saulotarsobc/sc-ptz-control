import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { arch, platform } from 'node:process';

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const targetIndex = process.argv.indexOf('--target');
const target =
  targetArg?.slice('--target='.length) ?? (targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined) ?? platform;

if (arch !== 'x64') {
  throw new Error(`PtzBridge só é distribuído para x64 por enquanto; arquitetura atual: ${arch}.`);
}

const rid = target === 'win32' ? 'win-x64' : target === 'linux' ? 'linux-x64' : null;
if (!rid) {
  throw new Error(`Não há pacote do PtzBridge para ${target}.`);
}

const publishDir = resolve('native/PtzBridge/publish');

// `dotnet publish -o` mescla com o conteúdo existente. Sem limpar, alternar entre
// Windows e Linux deixa apphosts e bibliotecas dos dois sistemas no instalador.
rmSync(publishDir, { recursive: true, force: true });

const args = [
  'publish',
  'native/PtzBridge/PtzBridge.csproj',
  '-c',
  'Release',
  '-r',
  rid,
  '--self-contained',
  '-o',
  publishDir,
];

// O SDK disponível no monorepo é o pacote Windows. Em um build Linux, inclusive
// quando feito numa máquina Windows, o bridge deve sair sem essas DLLs e usar
// RTSP+CGI. Forçar OS também impede que a ScPtzVCam.dll entre no pacote Linux.
if (target === 'linux') args.push('-p:HasNetSdk=false', '-p:OS=Unix');

const result = spawnSync('dotnet', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
