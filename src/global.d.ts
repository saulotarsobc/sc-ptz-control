import type { BridgeState } from "@/types";

declare global {
  interface Window {
    /** Exposta pelo preload (`backend/preload.ts`). */
    ptz: {
      getBridge: () => Promise<BridgeState>;
      restartBridge: () => Promise<BridgeState>;
    };
  }
}

export {};
