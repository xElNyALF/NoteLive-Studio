'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// API explícita: no expone Node.js ni archivos al código de la interfaz.
contextBridge.exposeInMainWorld('noteLiveDesktop', Object.freeze({
  appName: 'NoteLive Studio',
  isDesktopApp: true,
  version: '0.4.1',
  toggleFloatingOverlay: () => ipcRenderer.invoke('notelive:toggle-floating-overlay'),
  closeFloatingOverlay: () => ipcRenderer.send('notelive:close-floating-overlay'),
  openTwitchLogin: () => ipcRenderer.invoke('notelive:open-twitch-login'),
  checkForUpdates: () => ipcRenderer.invoke('notelive:check-for-updates'),
  getUpdateStatus: () => ipcRenderer.invoke('notelive:get-update-status'),
  restartAndInstallUpdate: () => ipcRenderer.invoke('notelive:restart-install-update'),
  onUpdateStatus: callback => ipcRenderer.on('notelive:update-status', (_event, status) => callback(status))
}));
