import { app, BrowserWindow } from "electron";
import electronUpdater from "electron-updater";

/**
 * Andamento da atualização, empurrado para o renderer pelo canal `update:status`.
 *
 * O mesmo contrato está em `src/types/index.ts` — mexeu num lado, mexa no outro.
 */
export type UpdateStatus =
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

// `electron-updater` é CJS e este main sai em ESM: o import nomeado depende da
// detecção de exports do Node, que não enxerga o `Object.defineProperty` usado
// pelo pacote. Importar o default e ler a propriedade funciona nos dois formatos.
// A leitura fica adiada porque `autoUpdater` é um getter que instancia o updater
// da plataforma — em dev, onde nada disso roda, nem chega a acontecer.
const updater = () => electronUpdater.autoUpdater;

function broadcast(status: UpdateStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("update:status", status);
  }
}

/**
 * Checa releases publicados no GitHub (bloco `publish` gerado em
 * electron-builder.json a partir do `repository` do package.json).
 *
 * Só faz sentido empacotado: em dev não existe `app-update.yml` e o
 * electron-updater lançaria erro só por tentar ler esse arquivo.
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  const autoUpdater = updater();

  autoUpdater.autoDownload = true;
  // O instalador é perMachine e registra a media source da câmera virtual em
  // HKLM (build/installer.nsh), então a atualização precisa passar pelo NSIS
  // com elevação — vai aparecer um prompt do UAC. Instalar ao sair é o momento
  // menos intrusivo para isso, e é o que mantém a DLL da câmera em dia com o app.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) =>
    broadcast({ state: "available", version: info.version }),
  );
  autoUpdater.on("download-progress", (progress) =>
    broadcast({ state: "downloading", percent: progress.percent }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    broadcast({ state: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (err) =>
    broadcast({ state: "error", message: err.message }),
  );

  autoUpdater
    .checkForUpdates()
    .catch((err) => console.error("[updater] checkForUpdates falhou:", err));
}

/**
 * Fecha o app e roda o instalador baixado.
 *
 * O `before-quit` do main derruba o sidecar no caminho — sem isso o NSIS não
 * conseguiria sobrescrever o PtzBridge.exe em uso.
 */
export function installUpdate(): void {
  updater().quitAndInstall();
}
