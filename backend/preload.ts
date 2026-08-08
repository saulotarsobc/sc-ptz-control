import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { UpdateStatus } from './updater';

/**
 * Ponte mínima com o renderer: o endereço do sidecar C# e o andamento da
 * atualização automática.
 *
 * Todo o resto (PTZ, presets, vídeo, miniaturas) o renderer fala direto com
 * 127.0.0.1 por WebSocket/HTTP usando esse endereço — sem passar pelo main, que
 * seria um salto a mais no caminho do vídeo.
 */
contextBridge.exposeInMainWorld('ptz', {
  getBridge: () => ipcRenderer.invoke('bridge:state'),
  restartBridge: () => ipcRenderer.invoke('bridge:restart'),

  /** Devolve a função de cancelamento, para usar direto no cleanup do useEffect. */
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.off('update:status', listener);
  },

  installUpdate: () => ipcRenderer.invoke('update:install'),
});
