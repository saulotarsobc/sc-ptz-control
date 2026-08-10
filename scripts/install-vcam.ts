import { spawnSync } from 'node:child_process';

if (process.platform === 'linux') {
  console.log('Instale o módulo do kernel: sudo apt install v4l2loopback-dkms v4l2loopback-utils');
  console.log('Depois carregue-o: sudo modprobe v4l2loopback devices=1 video_nr=10 card_label="SC PTZ Virtual Cam" exclusive_caps=1');
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.log('Câmera virtual não suportada nesta plataforma.');
  process.exit(0);
}

const result = spawnSync('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/install-vcam.ps1',
], { stdio: 'inherit' });
process.exit(result.status ?? 1);
