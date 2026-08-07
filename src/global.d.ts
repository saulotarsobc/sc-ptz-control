import type { BridgeState, UpdateStatus } from "@/types";

declare global {
  interface Window {
    /** Exposta pelo preload (`backend/preload.ts`). */
    ptz: {
      getBridge: () => Promise<BridgeState>;
      restartBridge: () => Promise<BridgeState>;
      /** Devolve a função de cancelamento da assinatura. */
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
      installUpdate: () => Promise<void>;
    };
  }
}

export {};
