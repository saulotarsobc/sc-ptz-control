import type { BridgeEndpoint, LinkState } from '@/types';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type EventHandler = (data: unknown) => void;

const CALL_TIMEOUT_MS = 20_000;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 5_000;

/**
 * Cliente do canal de controle (`/ws/control`) do sidecar C#.
 *
 * Correlaciona pedido e resposta por `id`, reconecta sozinho com backoff e entrega
 * os eventos que o backend empurra (`connection`, `stream`).
 *
 * Chamadas feitas enquanto o socket está caindo/subindo ficam na fila e são enviadas
 * quando ele reabre — a UI não precisa saber em que momento o enlace está.
 */
export class BridgeClient {
  private endpoint: BridgeEndpoint | null = null;
  private socket: WebSocket | null = null;
  private nextId = 1;
  private closed = false;
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly pending = new Map<number, Pending>();
  private readonly queue: string[] = [];
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly linkHandlers = new Set<(state: LinkState) => void>();

  private link: LinkState = 'closed';

  get linkState(): LinkState {
    return this.link;
  }

  connect(endpoint: BridgeEndpoint): void {
    this.endpoint = endpoint;
    this.closed = false;
    this.open();
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.setLink('closed');
  }

  /** Assina um evento empurrado pelo backend. Retorna a função para cancelar. */
  on(event: string, handler: EventHandler): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return () => set.delete(handler);
  }

  /** Assina o estado do enlace com o sidecar. Retorna a função para cancelar. */
  onLink(handler: (state: LinkState) => void): () => void {
    this.linkHandlers.add(handler);
    handler(this.link);
    return () => this.linkHandlers.delete(handler);
  }

  call<T = unknown>(op: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.endpoint) {
      return Promise.reject(new Error('Serviço de PTZ indisponível.'));
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ id, op, params });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tempo esgotado em '${op}'.`));
      }, CALL_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(payload);
      else this.queue.push(payload);
    });
  }

  /**
   * Dispara e esquece: usado no caminho quente do PTZ, onde o "soltar" não pode
   * ficar preso a um await e um erro isolado não deve virar exceção não tratada.
   */
  send(op: string, params?: Record<string, unknown>): void {
    this.call(op, params).catch(() => {});
  }

  private open(): void {
    if (!this.endpoint || this.closed) return;

    const { port, token } = this.endpoint;
    this.setLink('connecting');

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/control?token=${token}`);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.setLink('open');
      while (this.queue.length > 0) socket.send(this.queue.shift()!);
    };

    socket.onmessage = (event) => this.handleMessage(event.data);

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.setLink('closed');
      this.scheduleReconnect();
    };

    // O onclose sempre vem depois do onerror; deixamos a reconexão só para ele
    // para não agendar duas vezes.
    socket.onerror = () => {};
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;

    let message: {
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      event?: string;
      data?: unknown;
    };

    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.event) {
      this.handlers.get(message.event)?.forEach((handler) => handler(message.data));
      return;
    }

    if (message.id === undefined) return;

    const pending = this.pending.get(message.id);
    if (!pending) return;

    this.pending.delete(message.id);
    clearTimeout(pending.timer);

    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error ?? 'Falha desconhecida.'));
  }

  private setLink(state: LinkState): void {
    if (this.link === state) return;
    this.link = state;
    this.linkHandlers.forEach((handler) => handler(state));
  }
}
