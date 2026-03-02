import { app, dialog, Menu, MenuItemConstructorOptions, shell } from "electron";
import { repository } from "../../../package.json";

export function createAppMenu(): void {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    // { role: 'appMenu' }
    {
      label: "File",
      submenu: [
        isMac
          ? { role: "close", accelerator: "COMMAND+W" }
          : { role: "quit", accelerator: "CTRL+W" },
      ],
    },
    // { role: 'editMenu' }
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    // { role: 'viewMenu' }
    {
      label: "View",
      submenu: [
        { role: "reload", accelerator: "F5" },
        { role: "forceReload" },
        { role: "toggleDevTools", accelerator: "F12" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // { role: 'windowMenu' }
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal(repository.url);
          },
        },
        {
          label: "Version",
          click: async () => {
            dialog.showMessageBox({
              type: "info",
              title: "App version",
              message: `${app.getVersion()}`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template as MenuItemConstructorOptions[]);
  Menu.setApplicationMenu(menu);
}
