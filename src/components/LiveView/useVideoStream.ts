import type { BridgeEndpoint } from '@/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Espelho de `VideoFrameHeader` no C# (Server/Protocol.cs). Mantenha os dois em sincronia. */
const HEADER_BYTES = 16;
const MAGIC = 0x31564e50; // 'PNV1'

/** Sem frame por este tempo, a imagem é considerada parada. */
const STALL_MS = 2500;

export type VideoState = 'idle' | 'connecting' | 'live' | 'stalled' | 'error';

export type VideoStream = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  state: VideoState;
  error: string | null;
  width: number;
  height: number;
  /** JPEG do frame atual, na resolução do stream. `null` se ainda não há imagem. */
  captureJpeg: (quality?: number) => Promise<Blob | null>;
  /** Resolve no próximo frame desenhado; rejeita se estourar o tempo limite. */
  waitForFrame: (timeoutMs?: number) => Promise<void>;
};

/**
 * Recebe os frames NV12 de `/ws/video` e desenha no canvas.
 *
 * O caminho principal é o `VideoFrame` do WebCodecs, que aceita NV12 direto e deixa a
 * conversão YUV→RGB com a GPU. Se o navegador recusar esse formato, cai para uma
 * conversão manual em `ImageData` — mais cara, mas mantém a tela funcionando.
 */
export function useVideoStream(endpoint: BridgeEndpoint | null, channel: number, enabled = true): VideoStream {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<VideoState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // `useState` aqui geraria um render por frame; o desenho não precisa do React.
  const lastFrameAt = useRef(0);
  const rgbaFallback = useRef<Uint8ClampedArray<ArrayBuffer> | null>(null);

  // Quem está esperando o vídeo entrar no ar (ver `waitForFrame`).
  const frameWaiters = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!endpoint || !enabled) {
      setState('idle');
      return;
    }

    let closed = false;
    setState('connecting');
    setError(null);

    const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}/ws/video?token=${endpoint.token}&channel=${channel}`);
    socket.binaryType = 'arraybuffer';

    socket.onmessage = (event) => {
      const buffer = event.data as ArrayBuffer;
      if (buffer.byteLength <= HEADER_BYTES) return;

      const head = new DataView(buffer, 0, HEADER_BYTES);
      if (head.getUint32(0, true) !== MAGIC) return;

      const width = head.getUint16(4, true);
      const height = head.getUint16(6, true);
      const sequence = head.getUint32(8, true);

      const canvas = canvasRef.current;
      if (!canvas || width === 0 || height === 0) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        rgbaFallback.current = null;
        setSize({ width, height });
      }

      const nv12 = new Uint8Array(buffer, HEADER_BYTES);
      if (nv12.byteLength < (width * height * 3) / 2) return;

      draw(canvas, nv12, width, height, sequence, rgbaFallback);

      lastFrameAt.current = performance.now();
      if (frameWaiters.current.length > 0) {
        const waiters = frameWaiters.current;
        frameWaiters.current = [];
        for (const resolve of waiters) resolve();
      }
      setState((prev) => (prev === 'live' ? prev : 'live'));
    };

    socket.onclose = (event) => {
      if (closed) return;
      // O backend fecha com o motivo no `reason` quando não há sessão com o NVR.
      if (event.reason) {
        setError(event.reason);
        setState('error');
      } else {
        setState('idle');
      }
    };

    socket.onerror = () => {
      if (!closed) setState('error');
    };

    const stallTimer = setInterval(() => {
      if (lastFrameAt.current === 0) return;
      if (performance.now() - lastFrameAt.current > STALL_MS) {
        setState((prev) => (prev === 'live' ? 'stalled' : prev));
      }
    }, 1000);

    return () => {
      closed = true;
      clearInterval(stallTimer);
      lastFrameAt.current = 0;
      socket.close();
    };
  }, [channel, enabled, endpoint]);

  const captureJpeg = useCallback(async (quality = 0.82) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return null;
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }, []);

  /**
   * Espera o próximo frame ser desenhado.
   *
   * Serve para quem liga o vídeo só para capturar uma miniatura: o real-play do canal
   * leva um instante para começar a entregar imagem, e capturar antes disso pegaria um
   * canvas vazio.
   */
  const waitForFrame = useCallback((timeoutMs = 5000) => {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const waiter = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        frameWaiters.current = frameWaiters.current.filter((w) => w !== waiter);
        reject(new Error('Sem imagem ao vivo para capturar.'));
      }, timeoutMs);

      frameWaiters.current.push(waiter);
    });
  }, []);

  return {
    canvasRef,
    state,
    error,
    width: size.width,
    height: size.height,
    captureJpeg,
    waitForFrame,
  };
}

function draw(
  canvas: HTMLCanvasElement,
  nv12: Uint8Array,
  width: number,
  height: number,
  sequence: number,
  rgbaFallback: React.RefObject<Uint8ClampedArray<ArrayBuffer> | null>,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (!rgbaFallback.current && typeof VideoFrame !== 'undefined') {
    try {
      const frame = new VideoFrame(nv12, {
        format: 'NV12',
        codedWidth: width,
        codedHeight: height,
        timestamp: sequence * 33_333,
      });
      try {
        ctx.drawImage(frame, 0, 0);
      } finally {
        // Sem o close() cada frame vaza memória de GPU até o processo travar.
        frame.close();
      }
      return;
    } catch {
      // Formato recusado: liga o caminho manual e não tenta de novo.
      rgbaFallback.current = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
    }
  }

  if (!rgbaFallback.current) rgbaFallback.current = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  nv12ToRgba(nv12, width, height, rgbaFallback.current);
  ctx.putImageData(new ImageData(rgbaFallback.current, width, height), 0, 0);
}

/** BT.709 faixa limitada — mesma matriz que o caminho do WebCodecs usa. */
function nv12ToRgba(nv12: Uint8Array, width: number, height: number, out: Uint8ClampedArray<ArrayBuffer>) {
  const uvOffset = width * height;

  for (let y = 0; y < height; y++) {
    const uvRow = uvOffset + (y >> 1) * width;
    for (let x = 0; x < width; x++) {
      const luma = (nv12[y * width + x] - 16) * 1.164383;
      const uvIndex = uvRow + (x & ~1);
      const cb = nv12[uvIndex] - 128;
      const cr = nv12[uvIndex + 1] - 128;

      const i = (y * width + x) * 4;
      out[i] = luma + 1.792741 * cr;
      out[i + 1] = luma - 0.213249 * cb - 0.532909 * cr;
      out[i + 2] = luma + 2.112402 * cb;
      out[i + 3] = 255;
    }
  }
}
