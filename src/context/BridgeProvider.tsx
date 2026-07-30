import { createApi, type BridgeApi } from "@/services/bridge/api";
import { BridgeClient } from "@/services/bridge/client";
import type {
  BridgeEndpoint,
  BridgeState,
  DeviceConfig,
  DeviceStatus,
  LinkState,
  VcamStatus,
} from "@/types";
import { notifications } from "@mantine/notifications";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const OFFLINE_STATUS: DeviceStatus = {
  connected: false,
  serial: "",
  channelCount: 0,
  deviceType: "",
};

type BridgeContextValue = {
  /** Estado do sidecar C# (processo). */
  bridge: BridgeState;
  /** Estado do enlace WebSocket com o sidecar. */
  link: LinkState;
  endpoint: BridgeEndpoint | null;
  api: BridgeApi;
  config: DeviceConfig | null;
  status: DeviceStatus;
  /** Canal ativo, compartilhado entre as telas. */
  channel: number;
  setChannel: (channel: number) => void;
  /** Velocidade de PTZ em uso pelos controles (1..8). */
  speed: number;
  setSpeed: (speed: number) => void;
  /** Câmera virtual; `null` enquanto o estado não chegou do sidecar. */
  vcam: VcamStatus | null;
  /** Verdadeiro enquanto o Windows cria/remove o dispositivo. */
  vcamBusy: boolean;
  toggleVcam: () => Promise<void>;
  reloadConfig: () => Promise<DeviceConfig | null>;
  connectDevice: () => Promise<void>;
  restartBridge: () => Promise<void>;
};

const BridgeContext = createContext<BridgeContextValue | null>(null);

export function BridgeProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<BridgeClient>(null as unknown as BridgeClient);
  if (clientRef.current === null) clientRef.current = new BridgeClient();
  const client = clientRef.current;

  const api = useMemo(() => createApi(client), [client]);

  const [bridge, setBridge] = useState<BridgeState>({ status: "starting" });
  const [link, setLink] = useState<LinkState>("closed");
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [status, setStatus] = useState<DeviceStatus>(OFFLINE_STATUS);
  const [channel, setChannelState] = useState(1);
  const [speed, setSpeedState] = useState(4);
  const [vcam, setVcam] = useState<VcamStatus | null>(null);
  const [vcamBusy, setVcamBusy] = useState(false);

  const endpoint = bridge.status === "ready" ? bridge.endpoint : null;

  // — Descobre o sidecar e abre o canal de controle —
  useEffect(() => {
    if (!window.ptz) {
      setBridge({
        status: "failed",
        error: "Esta tela precisa rodar dentro do aplicativo (Electron).",
      });
      return;
    }
    window.ptz.getBridge().then(setBridge);
  }, []);

  useEffect(() => {
    if (!endpoint) return;
    client.connect(endpoint);
    return () => client.close();
  }, [client, endpoint]);

  useEffect(() => client.onLink(setLink), [client]);

  // — Eventos empurrados pelo backend —
  useEffect(
    () =>
      client.on("connection", (data) => {
        const state = (data as { state?: string })?.state;

        if (state === "disconnected") {
          setStatus((prev) => ({ ...prev, connected: false }));
          notifications.show({
            id: "nvr-connection",
            title: "Conexão perdida",
            message: "O NVR ficou fora de alcance. Tentando reconectar...",
            color: "orange",
          });
          return;
        }

        // "connected" e "reconnected": o status completo vem do backend.
        api.status().then(setStatus).catch(() => {});
        if (state === "reconnected") {
          notifications.show({
            id: "nvr-connection",
            title: "Conexão restabelecida",
            message: "O NVR voltou.",
            color: "green",
          });
        }
      }),
    [api, client],
  );

  // O sidecar avisa quando a câmera liga, desliga ou perde o sinal do NVR.
  useEffect(() => client.on("vcam", (data) => setVcam(data as VcamStatus)), [client]);

  useEffect(() => {
    if (link !== "open") return;
    api.vcamStatus().then(setVcam).catch(() => {});
  }, [api, link]);

  const toggleVcam = useCallback(async () => {
    const turnOff = vcam?.running === true;
    setVcamBusy(true);
    try {
      setVcam(turnOff ? await api.vcamStop() : await api.vcamStart(channel));
      notifications.show({
        id: "vcam",
        title: turnOff ? "Câmera virtual desligada" : "Câmera virtual ligada",
        message: turnOff
          ? "O dispositivo saiu da lista dos outros aplicativos."
          : `Selecione "${vcam?.name ?? "SC PTZ Virtual Cam"}" no OBS, Meet, Teams etc.`,
        color: turnOff ? "gray" : "green",
      });
    } catch (err) {
      notifications.show({
        id: "vcam",
        title: "Câmera virtual",
        message: err instanceof Error ? err.message : String(err),
        color: "red",
      });
    } finally {
      setVcamBusy(false);
    }
  }, [api, channel, vcam?.name, vcam?.running]);

  const reloadConfig = useCallback(async () => {
    try {
      const next = await api.configGet();
      setConfig(next);
      setChannelState(next.channel);
      setSpeedState(next.ptzSpeed);
      return next;
    } catch {
      return null;
    }
  }, [api]);

  const connectDevice = useCallback(async () => {
    try {
      setStatus(await api.connect());
    } catch (err) {
      setStatus(OFFLINE_STATUS);
      notifications.show({
        title: "Falha ao conectar",
        message: err instanceof Error ? err.message : String(err),
        color: "red",
      });
      throw err;
    }
  }, [api]);

  // — Ao abrir o enlace: carrega a config e tenta logar —
  useEffect(() => {
    if (link !== "open") return;

    let cancelled = false;
    (async () => {
      const loaded = await reloadConfig();
      if (cancelled || !loaded) return;

      const current = await api.status().catch(() => OFFLINE_STATUS);
      if (cancelled) return;
      setStatus(current);

      // Sem senha salva ainda é a primeira execução — a tela de Configurações
      // resolve isso, não adianta tentar logar e mostrar um erro.
      if (!current.connected && loaded.hasPassword) {
        await connectDevice().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, connectDevice, link, reloadConfig]);

  const setChannel = useCallback(
    (next: number) => {
      setChannelState(next);
      api.configSet({ channel: next }).then(setConfig).catch(() => {});
    },
    [api],
  );

  const setSpeed = useCallback(
    (next: number) => {
      setSpeedState(next);
      api.configSet({ ptzSpeed: next }).then(setConfig).catch(() => {});
    },
    [api],
  );

  const restartBridge = useCallback(async () => {
    setBridge({ status: "starting" });
    setBridge(await window.ptz.restartBridge());
  }, []);

  const value = useMemo<BridgeContextValue>(
    () => ({
      bridge,
      link,
      endpoint,
      api,
      config,
      status,
      channel,
      setChannel,
      speed,
      setSpeed,
      vcam,
      vcamBusy,
      toggleVcam,
      reloadConfig,
      connectDevice,
      restartBridge,
    }),
    [
      api,
      bridge,
      channel,
      config,
      connectDevice,
      endpoint,
      link,
      reloadConfig,
      restartBridge,
      setChannel,
      setSpeed,
      speed,
      status,
      toggleVcam,
      vcam,
      vcamBusy,
    ],
  );

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeContextValue {
  const value = useContext(BridgeContext);
  if (!value) throw new Error("useBridge precisa estar dentro de <BridgeProvider>.");
  return value;
}
