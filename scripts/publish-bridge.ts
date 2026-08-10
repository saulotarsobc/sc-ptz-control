import { spawnSync } from 'node:child_process';
import { platform, arch } from 'node:process';

if (arch !== 'x64') {
  throw new Error(`PtzBridge só é distribuído para x64 por enquanto; arquitetura atual: ${arch}.`);
}

const rid = platform === 'win32' ? 'win-x64' : platform === 'linux' ? 'linux-x64' : null;
if (!rid) {
  throw new Error(`Não há pacote do PtzBridge para ${platform}.`);
}

const result = spawnSync('dotnet', [
  'publish', 'native/PtzBridge/PtzBridge.csproj', '-c', 'Release', '-r', rid,
  '--self-contained', '-o', 'native/PtzBridge/publish',
], { stdio: 'inherit', shell: process.platform === 'win32' });

process.exit(result.status ?? 1);
