import type { BridgeState, UpdateStatus } from '@/types';

declare global {
  interface Window {
    /** Exposta pelo preload (`backend/preload.ts`). */
    ptz: {
      getBridge: () => Promise<BridgeState>;
      restartBridge: () => Promise<BridgeState>;
      /** Cada assinatura devolve sua própria função de cancelamento. */
      onBridgeState: (callback: (state: BridgeState) => void) => () => void;
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
      installUpdate: () => Promise<void>;
    };
  }
}

export {};
