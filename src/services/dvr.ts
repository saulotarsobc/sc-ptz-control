import type { DeviceConfig } from "@/types";
import { md5 } from "js-md5";

// === Digest Authentication (RFC 2617) ===

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop: string;
  opaque: string;
}

function parseDigestChallenge(header: string): DigestChallenge | null {
  if (!header.toLowerCase().startsWith("digest ")) return null;

  const params: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"(?:,\s*)?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header)) !== null) {
    params[match[1]] = match[2];
  }

  return {
    realm: params.realm ?? "",
    nonce: params.nonce ?? "",
    qop: params.qop ?? "",
    opaque: params.opaque ?? "",
  };
}

function generateCnonce(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildDigestHeader(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: DigestChallenge,
  nc: number,
): string {
  const cnonce = generateCnonce();
  const ncHex = nc.toString(16).padStart(8, "0");

  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  const response = challenge.qop
    ? md5(
        `${ha1}:${challenge.nonce}:${ncHex}:${cnonce}:${challenge.qop}:${ha2}`,
      )
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  let header = `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${response}"`;

  if (challenge.qop) {
    header += `, qop=${challenge.qop}, nc=${ncHex}, cnonce="${cnonce}"`;
  }
  if (challenge.opaque) {
    header += `, opaque="${challenge.opaque}"`;
  }

  return header;
}

// === Timeout-aware fetch ===

const FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new DOMException("Request timed out", "TimeoutError")),
    FETCH_TIMEOUT_MS,
  );
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// === Nonce Cache (avoids double-request on every call) ===
let cachedChallenge: DigestChallenge | null = null;
let nonceCount = 0;

export function invalidateAuthCache(): void {
  cachedChallenge = null;
  nonceCount = 0;
}

async function fetchWithDigestAuth(
  url: string,
  username: string,
  password: string,
): Promise<Response> {
  const uri = new URL(url).pathname + new URL(url).search;

  // Try cached nonce first
  if (cachedChallenge) {
    nonceCount++;
    const authHeader = buildDigestHeader(
      username,
      password,
      "GET",
      uri,
      cachedChallenge,
      nonceCount,
    );
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: authHeader },
    });
    if (res.status !== 401) return res;
    // Nonce expired — fall through to re-authenticate
    cachedChallenge = null;
    nonceCount = 0;
  }

  // 1) First request — expect 401 with WWW-Authenticate
  const initial = await fetchWithTimeout(url);

  if (initial.status !== 401) return initial;

  const wwwAuth = initial.headers.get("WWW-Authenticate");
  if (!wwwAuth) return initial;

  const challenge = parseDigestChallenge(wwwAuth);
  if (!challenge) return initial;

  // 2) Cache the challenge and build proper Digest response
  cachedChallenge = challenge;
  nonceCount = 1;
  const authHeader = buildDigestHeader(
    username,
    password,
    "GET",
    uri,
    challenge,
    nonceCount,
  );

  return fetchWithTimeout(url, {
    headers: { Authorization: authHeader },
  });
}

// === DVR API ===

export async function gotoPreset(
  config: DeviceConfig,
  presetId: number,
): Promise<void> {
  const { device, username, password, channel } = config;
  const url = `http://${device}/cgi-bin/ptz.cgi?action=start&code=GotoPreset&channel=${channel}&arg1=0&arg2=${presetId}&arg3=0`;
  const res = await fetchWithDigestAuth(url, username, password);
  if (!res.ok) throw new Error(`Falha ao mover preset: HTTP ${res.status}`);
}

export async function setPreset(
  config: DeviceConfig,
  presetId: number,
): Promise<void> {
  const { device, username, password, channel } = config;
  const url = `http://${device}/cgi-bin/ptz.cgi?action=start&code=SetPreset&channel=${channel}&arg1=0&arg2=${presetId}&arg3=0`;
  const res = await fetchWithDigestAuth(url, username, password);
  if (!res.ok) throw new Error(`Falha ao salvar preset: HTTP ${res.status}`);
}

export async function getSnapshot(config: DeviceConfig): Promise<string> {
  const { device, username, password, channel } = config;
  const url = `http://${device}/cgi-bin/snapshot.cgi?channel=${channel}&type=1`;
  const res = await fetchWithDigestAuth(url, username, password);
  if (!res.ok) throw new Error(`Falha ao capturar imagem: HTTP ${res.status}`);
  const blob = await res.blob();
  return blobToBase64(blob);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// === Auto-Capture ===

export interface AutoCaptureProgress {
  current: number;
  total: number;
  presetId: number;
  phase: "moving" | "capturing";
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function autoCaptureAll(
  config: DeviceConfig,
  presetIds: number[],
  onProgress: (progress: AutoCaptureProgress) => void,
  onCapture: (presetId: number, base64: string) => void,
  signal: AbortSignal,
  settleMs = 3000,
): Promise<void> {
  const total = presetIds.length;

  for (let i = 0; i < total; i++) {
    if (signal.aborted) break;

    const presetId = presetIds[i];

    // Move to preset — skip this preset on error, re-throw cancellation
    onProgress({ current: i + 1, total, presetId, phase: "moving" });
    try {
      await gotoPreset(config, presetId);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      continue;
    }

    // Wait for camera to settle
    await delay(settleMs, signal);

    if (signal.aborted) break;

    // Capture snapshot — skip this preset on error
    onProgress({ current: i + 1, total, presetId, phase: "capturing" });
    try {
      const base64 = await getSnapshot(config);
      onCapture(presetId, base64);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // continue to next preset on snapshot failure
    }
  }
}
