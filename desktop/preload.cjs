'use strict';

const { contextBridge } = require('electron');

// Intentionally expose only harmless app metadata. The local server keeps all
// Spotify/ElevenLabs credentials outside the renderer process.
contextBridge.exposeInMainWorld('noteLiveDesktop', Object.freeze({
  appName: 'NoteLive Studio',
  isDesktopApp: true,
  version: '0.3.0'
}));
