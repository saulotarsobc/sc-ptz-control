import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
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
let startPromise: Promise<BridgeState> | null = null;
const stateListeners = new Set<(next: BridgeState) => void>();

function setState(next: BridgeState): BridgeState {
  state = next;
  for (const listener of stateListeners) {
    try {
      listener(next);
    } catch {
      // Um observador da UI não pode interferir no ciclo de vida do sidecar.
    }
  }
  return next;
}

/** Onde está o sidecar .NET Windows x64. */
function resolveExecutable(): string {
  const executable = 'PtzBridge.exe';
  if (VITE_DEV_SERVER_URL) {
    // __dirname é dist/backend/ → sobe dois níveis até a raiz do projeto.
    return path.join(__dirname, '..', '..', 'native', 'PtzBridge', 'bin', 'Debug', 'net8.0-windows', executable);
  }
  return path.join(process.resourcesPath, 'ptz-bridge', executable);
}

/**
 * Sobe o sidecar e resolve quando ele anuncia a porta na primeira linha do stdout.
 * Falhas esperadas viram `state.status === "failed"` para o renderer mostrar um erro
 * legível em vez de uma tela morta. A API pública também captura falhas inesperadas.
 */
async function startBridgeAttempt(): Promise<BridgeState> {
  const exe = resolveExecutable();

  try {
    await access(exe);
  } catch {
    const failed: BridgeState = {
      status: 'failed',
      error: `PtzBridge não encontrado em ${exe}. Rode: pnpm build:bridge`,
    };
    if (VITE_DEV_SERVER_URL) console.error(`[ptz-bridge] ${failed.error}`);
    return setState(failed);
  }

  const token = randomBytes(16).toString('hex');

  // stdin em pipe é o "sinal de vida" do pai: quando o Electron morre o pipe fecha e o
  // sidecar se encerra sozinho, sem deixar a sessão do NVR pendurada.
  const spawned = spawn(exe, ['--port', '0', '--token', token], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: process.env,
  });
  child = spawned;

  spawned.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    // No app empacotado não há terminal confiável: o pipe pode sumir depois que o
    // launcher retorna e uma escrita tardia causaria EPIPE no processo principal.
    if (VITE_DEV_SERVER_URL) process.stderr.write(`[ptz-bridge] ${chunk}`);
  });

  spawned.on('exit', (code) => {
    // O exit de um processo substituído durante "Tentar novamente" não pode
    // apagar o handle nem o estado da tentativa nova.
    if (child !== spawned) return;
    child = null;
    if (state.status === 'ready') {
      setState({ status: 'failed', error: `O serviço de PTZ encerrou (código ${code}).` });
    }
  });

  const result = await new Promise<BridgeState>((resolve) => {
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

    spawned.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
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

    spawned.on('error', (err) =>
      settle({ status: 'failed', error: `Não foi possível iniciar o serviço: ${err.message}` }),
    );

    spawned.on('exit', (code) => settle({ status: 'failed', error: `O serviço de PTZ encerrou (código ${code}).` }));
  });

  setState(result);
  if (result.status === 'ready') {
    if (VITE_DEV_SERVER_URL) console.log(`[ptz-bridge] pronto em 127.0.0.1:${result.endpoint.port}`);
  } else if (result.status === 'failed') {
    if (VITE_DEV_SERVER_URL) console.error(`[ptz-bridge] ${result.error}`);
  }

  return result;
}

/**
 * Uma única tentativa pode estar em andamento. Isso permite que o IPC inicial aguarde
 * a mesma inicialização disparada pelo `ready`, sem criar um segundo PtzBridge.
 */
export function startBridge(): Promise<BridgeState> {
  if (startPromise) return startPromise;

  setState({ status: 'starting' });
  const attempt = startBridgeAttempt().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const failed: BridgeState = { status: 'failed', error: `Não foi possível iniciar o serviço: ${message}` };
    if (VITE_DEV_SERVER_URL) console.error(`[ptz-bridge] ${failed.error}`);
    return setState(failed);
  });
  startPromise = attempt;
  void attempt.then(() => {
    if (startPromise === attempt) startPromise = null;
  });
  return attempt;
}

/** O primeiro IPC espera a tentativa em voo; a janela continua livre para renderizar `starting`. */
export function waitForBridgeState(): Promise<BridgeState> {
  return state.status === 'starting' && startPromise ? startPromise : Promise.resolve(state);
}

export function onBridgeState(listener: (next: BridgeState) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function stopBridge(): void {
  if (!child) return;
  // Fechar o stdin já basta (o sidecar detecta e sai); o kill é a rede de segurança.
  const current = child;
  child = null;
  current.stdin?.end();
  current.kill();
}
