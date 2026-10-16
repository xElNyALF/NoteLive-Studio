'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// API explícita: no expone Node.js ni archivos al código de la interfaz.
contextBridge.exposeInMainWorld('noteLiveDesktop', Object.freeze({
  appName: 'NoteLive Studio',
  isDesktopApp: true,
  version: '0.3.2',
  toggleFloatingOverlay: () => ipcRenderer.invoke('notelive:toggle-floating-overlay'),
  closeFloatingOverlay: () => ipcRenderer.send('notelive:close-floating-overlay')
}));
