import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { __dirname, VITE_DEV_SERVER_URL } from './constants';

/**
 * Endereço do sidecar C# entregue ao renderer. O token é sorteado a cada execução:
 * o servidor escuta em 127.0.0.1 e sem ele qualquer página aberta no navegador da
 * máquina conseguiria mexer na câmera.
 */
export type BridgeEndpoint = {
  port: number;
  token: string;
};

export type BridgeState =
  { status: 'starting' } | { status: 'ready'; endpoint: BridgeEndpoint } | { status: 'failed'; error: string };

const READY_TIMEOUT_MS = 15_000;

let child: ChildProcess | null = null;
let state: BridgeState = { status: 'starting' };

/** Onde está o sidecar .NET: .exe no Windows e executável sem extensão no Linux. */
function resolveExecutable(): string {
  const executable = process.platform === 'win32' ? 'PtzBridge.exe' : 'PtzBridge';
  if (VITE_DEV_SERVER_URL) {
    // __dirname é dist/backend/ → sobe dois níveis até a raiz do projeto.
    return path.join(__dirname, '..', '..', 'native', 'PtzBridge', 'bin', 'Debug', 'net8.0', executable);
  }
  return path.join(process.resourcesPath, 'ptz-bridge', executable);
}

/**
 * Sobe o sidecar e resolve quando ele anuncia a porta na primeira linha do stdout.
 * A promise nunca rejeita: a falha vira `state.status === "failed"` para o renderer
 * mostrar um erro legível em vez de uma tela morta.
 */
export async function startBridge(): Promise<BridgeState> {
  const exe = resolveExecutable();

  if (!existsSync(exe)) {
    state = {
      status: 'failed',
      error: `PtzBridge não encontrado em ${exe}. Rode: pnpm build:bridge`,
    };
    console.error(state.error);
    return state;
  }

  const token = randomBytes(16).toString('hex');

  // stdin em pipe é o "sinal de vida" do pai: quando o Electron morre o pipe fecha e o
  // sidecar se encerra sozinho, sem deixar a sessão do NVR pendurada.
  child = spawn(exe, ['--port', '0', '--token', token], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    // SDKs nativos opcionais do Linux podem depender de .so irmãos. O resolver .NET
    // cobre os imports diretos; este caminho cobre as dependências internas dessas libs.
    env: process.platform === 'linux'
      ? { ...process.env, LD_LIBRARY_PATH: [path.dirname(exe), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') }
      : process.env,
  });

  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    process.stderr.write(`[ptz-bridge] ${chunk}`);
  });

  child.on('exit', (code) => {
    child = null;
    if (state.status === 'ready') {
      state = { status: 'failed', error: `O serviço de PTZ encerrou (código ${code}).` };
    }
  });

  state = await new Promise<BridgeState>((resolve) => {
    let buffer = '';
    let settled = false;

    const settle = (next: BridgeState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(next);
    };

    const timer = setTimeout(
      () => settle({ status: 'failed', error: 'O serviço de PTZ não respondeu a tempo.' }),
      READY_TIMEOUT_MS,
    );

    child?.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;

      try {
        const handshake = JSON.parse(buffer.slice(0, newline));
        settle(
          handshake.ready
            ? { status: 'ready', endpoint: { port: handshake.port, token } }
            : { status: 'failed', error: handshake.error ?? 'Falha desconhecida.' },
        );
      } catch {
        settle({ status: 'failed', error: 'Resposta inválida do serviço de PTZ.' });
      }
    });

    child?.on('error', (err) =>
      settle({ status: 'failed', error: `Não foi possível iniciar o serviço: ${err.message}` }),
    );

    child?.on('exit', (code) => settle({ status: 'failed', error: `O serviço de PTZ encerrou (código ${code}).` }));
  });

  if (state.status === 'ready') {
    console.log(`[ptz-bridge] pronto em 127.0.0.1:${state.endpoint.port}`);
  } else if (state.status === 'failed') {
    console.error(`[ptz-bridge] ${state.error}`);
  }

  return state;
}

export function getBridgeState(): BridgeState {
  return state;
}

export function stopBridge(): void {
  if (!child) return;
  // Fechar o stdin já basta (o sidecar detecta e sai); o kill é a rede de segurança.
  child.stdin?.end();
  child.kill();
  child = null;
}
