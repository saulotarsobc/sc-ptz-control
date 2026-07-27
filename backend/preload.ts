import { contextBridge, ipcRenderer } from "electron";

/**
 * Ponte mínima com o renderer: só o endereço do sidecar C#.
 *
 * Todo o resto (PTZ, presets, vídeo, miniaturas) o renderer fala direto com
 * 127.0.0.1 por WebSocket/HTTP usando esse endereço — sem passar pelo main, que
 * seria um salto a mais no caminho do vídeo.
 */
contextBridge.exposeInMainWorld("ptz", {
  getBridge: () => ipcRenderer.invoke("bridge:state"),
  restartBridge: () => ipcRenderer.invoke("bridge:restart"),
});
