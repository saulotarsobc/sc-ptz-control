import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32') {
  console.log('Câmera virtual Linux: use v4l2loopback (não há DLL para compilar).');
  process.exit(0);
}

const result = spawnSync('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-vcam.ps1',
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
