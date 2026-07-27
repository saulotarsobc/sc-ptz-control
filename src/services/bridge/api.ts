import type {
  DeviceConfig,
  DeviceConfigInput,
  DeviceStatus,
  Preset,
  PtzDirection,
  StreamFormat,
} from "@/types";
import type { BridgeClient } from "./client";

/**
 * Funções tipadas sobre o `BridgeClient` — uma por operação do protocolo.
 *
 * Os comandos contínuos de PTZ usam `send` (dispara e esquece) porque nas bordas de
 * pressionar/soltar não faz sentido esperar resposta: o que garante que a câmera para
 * é o watchdog do backend, não o await daqui.
 */
export function createApi(client: BridgeClient) {
  return {
    configGet: () => client.call<DeviceConfig>("config.get"),
    configSet: (config: DeviceConfigInput) =>
      client.call<DeviceConfig>("config.set", config),

    connect: () => client.call<DeviceStatus>("device.connect"),
    disconnect: () => client.call<DeviceStatus>("device.disconnect"),
    status: () => client.call<DeviceStatus>("device.status"),

    move: (channel: number, dir: PtzDirection, speed: number, stop: boolean) =>
      client.send("ptz.move", { channel, dir, speed, stop }),
    zoom: (channel: number, tele: boolean, speed: number, stop: boolean) =>
      client.send("ptz.zoom", { channel, tele, speed, stop }),
    focus: (channel: number, far: boolean, speed: number, stop: boolean) =>
      client.send("ptz.focus", { channel, far, speed, stop }),
    iris: (channel: number, open: boolean, speed: number, stop: boolean) =>
      client.send("ptz.iris", { channel, open, speed, stop }),
    stopAll: (channel: number) => client.send("ptz.stopAll", { channel }),

    presetGoto: (channel: number, preset: number) =>
      client.call<null>("preset.goto", { channel, preset }),
    presetSet: (channel: number, preset: number) =>
      client.call<null>("preset.set", { channel, preset }),
    presetDelete: (channel: number, preset: number) =>
      client.call<null>("preset.delete", { channel, preset }),
    presetList: (channel: number) => client.call<Preset[]>("preset.list", { channel }),

    streamInfo: (channel: number) => client.call<StreamFormat>("stream.info", { channel }),
  };
}

export type BridgeApi = ReturnType<typeof createApi>;

/** URL da miniatura de um preset. `rev` muda quando a imagem muda, quebrando o cache. */
export function thumbUrl(
  port: number,
  token: string,
  channel: number,
  preset: number,
  rev: number,
): string {
  return `http://127.0.0.1:${port}/api/thumb/${channel}/${preset}?token=${token}&v=${rev}`;
}

/** Grava a miniatura de um preset e devolve a nova `rev`. */
export async function putThumb(
  port: number,
  token: string,
  channel: number,
  preset: number,
  jpeg: Blob,
): Promise<number> {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/thumb/${channel}/${preset}?token=${token}`,
    { method: "PUT", body: jpeg },
  );
  if (!response.ok) throw new Error(`Falha ao salvar a miniatura (HTTP ${response.status}).`);
  const body = (await response.json()) as { rev: number };
  return body.rev;
}

export async function deleteThumb(
  port: number,
  token: string,
  channel: number,
  preset: number,
): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/api/thumb/${channel}/${preset}?token=${token}`, {
    method: "DELETE",
  });
}
