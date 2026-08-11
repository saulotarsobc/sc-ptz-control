import { spawnSync } from 'node:child_process';

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const targetIndex = process.argv.indexOf('--target');
const target =
  targetArg?.slice('--target='.length) ??
  (targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined) ??
  process.platform;

if (target !== 'win32') {
  console.log('Câmera virtual Linux: use v4l2loopback (não há DLL para compilar).');
  process.exit(0);
}

if (process.platform !== 'win32') {
  throw new Error('A câmera virtual do Windows só pode ser compilada no Windows.');
}

const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-vcam.ps1'],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
