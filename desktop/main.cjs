'use strict';

const { app, BrowserWindow, dialog, shell, Menu, desktopCapturer, session, ipcMain, screen } = require('electron');
const packageInfo = require('../package.json');
const updateConfig = require('../update-config.json');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'NoteLive Studio';
const HOST = '127.0.0.1';
const PORT = Number(process.env.NOTE_LIVE_PORT || process.env.SPOTIFY_OVERLAY_PORT || 8787);
const BASE_URL = `http://${HOST}:${PORT}`;
const LEGACY_FILES = ['config.json', 'tokens.json'];

app.setName(APP_NAME);
// Keep user data under a stable, readable per-user folder on Windows.
app.setPath('userData', path.join(app.getPath('appData'), 'notelive-studio'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  let floatingOverlayWindow = null;
  let localServer = null;
  let isQuitting = false;
  let serverModule = null;
  let updateCheckTimer = null;
  let manualUpdateCheck = false;
  let updateReady = false;
  let currentUpdateStatus = { state: 'idle', message: '', detail: '', percent: 0, version: '' };


  function createFloatingOverlay() {
    if (floatingOverlayWindow && !floatingOverlayWindow.isDestroyed()) {
      floatingOverlayWindow.show();
      floatingOverlayWindow.focus();
      return floatingOverlayWindow;
    }
    const area = screen.getPrimaryDisplay().workArea;
    floatingOverlayWindow = new BrowserWindow({
      width: 540,
      height: 190,
      x: Math.max(area.x, area.x + area.width - 560),
      y: area.y + 26,
      title: APP_NAME + ' · Mini overlay',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
    floatingOverlayWindow.setAlwaysOnTop(true, 'floating');
    floatingOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    floatingOverlayWindow.on('closed', () => { floatingOverlayWindow = null; });
    floatingOverlayWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(BASE_URL + '/')) return { action: 'allow' };
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    floatingOverlayWindow.loadURL(BASE_URL + '/overlay?floating=1');
    return floatingOverlayWindow;
  }

  ipcMain.handle('notelive:toggle-floating-overlay', () => {
    if (floatingOverlayWindow && !floatingOverlayWindow.isDestroyed()) {
      floatingOverlayWindow.close();
      return { open: false };
    }
    createFloatingOverlay();
    return { open: true };
  });
  ipcMain.on('notelive:close-floating-overlay', () => {
    if (floatingOverlayWindow && !floatingOverlayWindow.isDestroyed()) floatingOverlayWindow.close();
  });

  ipcMain.handle('notelive:open-twitch-login', async () => {
    await shell.openExternal(BASE_URL + '/twitch/connect');
    return { opened: true };
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  function hasLegacySettings(folderPath) {
    return LEGACY_FILES.some(file => fs.existsSync(path.join(folderPath, file)));
  }

  async function importLegacySettings(dataDir) {
    const alreadyHasSettings = LEGACY_FILES.some(file => fs.existsSync(path.join(dataDir, file)));
    if (alreadyHasSettings) return;

    const answer = await dialog.showMessageBox({
      type: 'question',
      title: `${APP_NAME} · Importar configuración`,
      message: '¿Ya usabas la versión web de NoteLive / Spotify Live Studio?',
      detail: 'Puedes importar tu Client ID, la sesión de Spotify y los ajustes de ElevenLabs/TikTok seleccionando la carpeta antigua. Los archivos se copiarán a la carpeta privada de datos de NoteLive Studio y no se borrará el proyecto anterior.',
      buttons: ['Importar configuración', 'Empezar desde cero'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (answer.response !== 0) return;

    const result = await dialog.showOpenDialog({
      title: 'Selecciona la carpeta del proyecto web anterior',
      properties: ['openDirectory'],
      buttonLabel: 'Importar esta carpeta'
    });
    if (result.canceled || !result.filePaths?.[0]) return;

    let selected = result.filePaths[0];
    // Also accept selecting a parent folder that contains spotify-live-overlay.
    if (!hasLegacySettings(selected)) {
      const childCandidates = ['spotify-live-overlay', 'spotify-live-studio', 'notelive-studio'];
      const child = childCandidates.map(name => path.join(selected, name)).find(hasLegacySettings);
      if (child) selected = child;
    }

    const copied = [];
    for (const filename of LEGACY_FILES) {
      const source = path.join(selected, filename);
      const target = path.join(dataDir, filename);
      if (fs.existsSync(source) && !fs.existsSync(target)) {
        fs.copyFileSync(source, target);
        copied.push(filename);
      }
    }

    if (!copied.length) {
      await dialog.showMessageBox({
        type: 'warning',
        title: `${APP_NAME} · No se encontraron ajustes`,
        message: 'No se encontraron config.json ni tokens.json en esa carpeta.',
        detail: 'Selecciona la carpeta raíz del proyecto web antiguo, donde estaba server.js. Puedes continuar y configurar las cuentas desde el panel.'
      });
    } else {
      await dialog.showMessageBox({
        type: 'info',
        title: `${APP_NAME} · Importación terminada`,
        message: 'Se importó la configuración.',
        detail: `Archivos copiados: ${copied.join(', ')}. El proyecto anterior permanece intacto.`
      });
    }
  }

  function buildMenu() {
    const template = [
      {
        label: APP_NAME,
        submenu: [
          {
            label: 'Abrir panel principal',
            click: () => mainWindow?.loadURL(`${BASE_URL}/`)
          },
          {
            label: 'Abrir overlay musical (vista previa)',
            click: () => mainWindow?.loadURL(`${BASE_URL}/overlay`)
          },
          {
            label: 'Buscar actualizaciones…',
            click: () => checkForUpdates(true)
          },
          {
            label: 'Reiniciar e instalar actualización',
            enabled: updateReady,
            click: () => autoUpdater.quitAndInstall()
          },
          {
            label: 'Abrir Spotify Developer Dashboard',
            click: () => shell.openExternal('https://developer.spotify.com/dashboard/')
          },
          { type: 'separator' },
          { role: 'quit', label: 'Salir de NoteLive Studio' }
        ]
      },
      {
        label: 'Vista',
        submenu: [
          { role: 'reload', label: 'Recargar panel' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
          { type: 'separator' },
          { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }


  function updateRepositoryConfigured() {
    const provider = updateConfig && updateConfig.provider;
    const owner = updateConfig && updateConfig.owner;
    const repo = updateConfig && updateConfig.repo;
    return Boolean(provider === 'github' &&
      typeof owner === 'string' && owner.trim() &&
      typeof repo === 'string' && repo.trim() &&
      !owner.includes('YOUR_') && !repo.includes('YOUR_'));
  }

  function refreshMenu() {
    if (mainWindow && !mainWindow.isDestroyed()) buildMenu();
  }

  function publishUpdateStatus(payload = {}) {
    currentUpdateStatus = { ...currentUpdateStatus, ...payload };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notelive:update-status', currentUpdateStatus);
    }
  }

  function checkForUpdates(manual = false) {
    manualUpdateCheck = manual;
    if (updateReady) {
      if (manual) publishUpdateStatus({
        state: 'ready',
        message: 'Listo, reinicia para instalar.',
        detail: `NoteLive Studio ${currentUpdateStatus.version || app.getVersion()} ya se descargó. Puedes reiniciar ahora o hacerlo más tarde desde el menú.`,
        percent: 100
      });
      return;
    }
    if (manual) publishUpdateStatus({
      state: 'checking',
      message: 'Buscando actualizaciones…',
      detail: 'Un momento, estamos comprobando si hay una versión nueva.'
    });
    if (!app.isPackaged) {
      if (manual) publishUpdateStatus({
        state: 'error',
        message: 'La actualización solo está disponible en la versión instalada.',
        detail: 'Abre NoteLive Studio desde su instalador para buscar versiones nuevas.'
      });
      manualUpdateCheck = false;
      return;
    }
    if (!updateRepositoryConfigured()) {
      if (manual) publishUpdateStatus({
        state: 'error',
        message: 'No se pudo comprobar la actualización.',
        detail: 'Falta configurar el repositorio oficial en update-config.json.'
      });
      manualUpdateCheck = false;
      return;
    }
    autoUpdater.checkForUpdates().catch(error => {
      console.error(`[${APP_NAME}] No se pudo comprobar actualizaciones:`, error);
      if (manual) publishUpdateStatus({
        state: 'error',
        message: 'No se pudo comprobar la actualización.',
        detail: error.message || String(error)
      });
      manualUpdateCheck = false;
    });
  }

  ipcMain.handle('notelive:check-for-updates', () => {
    checkForUpdates(true);
    return { started: true };
  });

  ipcMain.handle('notelive:get-update-status', () => currentUpdateStatus);

  ipcMain.handle('notelive:restart-install-update', () => {
    if (!updateReady) return { started: false };
    autoUpdater.quitAndInstall();
    return { started: true };
  });
  function configureAutoUpdates() {
    if (!app.isPackaged || !updateRepositoryConfigured()) return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      console.log(`[${APP_NAME}] Buscando actualizaciones…`);
      if (manualUpdateCheck) publishUpdateStatus({
        state: 'checking',
        message: 'Buscando actualizaciones…',
        detail: 'Comprobando la versión más reciente.'
      });
    });
    autoUpdater.on('update-available', info => {
      console.log(`[${APP_NAME}] Actualización disponible: ${info.version}`);
      publishUpdateStatus({
        state: 'downloading',
        message: `Descargando NoteLive Studio ${info.version}…`,
        detail: 'Puedes seguir usando la aplicación mientras se descarga.',
        version: info.version,
        percent: 0
      });
    });
    autoUpdater.on('update-not-available', info => {
      if (manualUpdateCheck) publishUpdateStatus({
        state: 'up-to-date',
        message: 'Ya tienes la versión más reciente.',
        detail: `Versión instalada: ${app.getVersion()}`,
        version: info && info.version || app.getVersion(),
        percent: 0
      });
      manualUpdateCheck = false;
    });
    autoUpdater.on('download-progress', progress => {
      const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0)));
      console.log(`[${APP_NAME}] Descarga de actualización: ${percent}%`);
      publishUpdateStatus({
        state: 'downloading',
        message: 'Descargando actualización…',
        detail: `Puedes seguir usando NoteLive Studio. ${percent}% descargado.`,
        percent,
        transferred: Number(progress.transferred) || 0,
        total: Number(progress.total) || 0,
        bytesPerSecond: Number(progress.bytesPerSecond) || 0
      });
    });
    autoUpdater.on('update-downloaded', info => {
      updateReady = true;
      refreshMenu();
      publishUpdateStatus({
        state: 'ready',
        message: 'Listo, reinicia para instalar.',
        detail: `NoteLive Studio ${info.version} se descargó correctamente. Pulsa “Reiniciar para instalar” cuando quieras aplicar la actualización.`,
        version: info.version,
        percent: 100
      });
      manualUpdateCheck = false;
    });
    autoUpdater.on('error', error => {
      console.error(`[${APP_NAME}] Error del actualizador:`, error);
      if (manualUpdateCheck || currentUpdateStatus.state === 'checking' || currentUpdateStatus.state === 'downloading') {
        publishUpdateStatus({
          state: 'error',
          message: 'No se pudo completar la actualización.',
          detail: error.message || String(error)
        });
      }
      manualUpdateCheck = false;
    });

    // Check after the main window opens, then every six hours.
    setTimeout(() => checkForUpdates(false), 12000);
    updateCheckTimer = setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);
  }
  async function waitForPanel(maxAttempts = 40) {
    for (let i = 0; i < maxAttempts; i += 1) {
      try {
        const response = await fetch(`${BASE_URL}/api/status`);
        if (response.ok) return true;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  }

  async function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1180,
      height: 900,
      minWidth: 900,
      minHeight: 680,
      show: false,
      title: APP_NAME,
      backgroundColor: '#0a0d0b',
      autoHideMenuBar: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(`${BASE_URL}/`)) return { action: 'allow' };
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    // Spotify's authorization must happen in the user's default browser.
    // The callback still returns to this app's local server; the dashboard
    // updates in the Electron window through its server-sent events.
    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
      if (targetUrl.startsWith(`${BASE_URL}/`)) return;
      if (/^https?:\/\//i.test(targetUrl)) {
        event.preventDefault();
        shell.openExternal(targetUrl).catch(error => {
          dialog.showErrorBox(APP_NAME, `No se pudo abrir el navegador para iniciar sesión.\n${error.message}`);
        });
      } else {
        event.preventDefault();
      }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (validatedURL.startsWith(BASE_URL)) {
        console.warn(`[${APP_NAME}] Error al cargar el panel: ${errorCode} ${errorDescription}`);
      }
    });

    await mainWindow.loadURL(`${BASE_URL}/`);
    mainWindow.show();
  }

  app.whenReady().then(async () => {
    // Se activa solo desde el botón del visualizador. Electron entrega audio WASAPI loopback en Windows.
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const requestUrl = request && request.frame && request.frame.url;
      if (requestUrl && !requestUrl.startsWith(BASE_URL)) return callback(null);
      desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      }).then(sources => {
        const firstScreen = sources && sources[0];
        callback(firstScreen ? { video: firstScreen, audio: 'loopback' } : null);
      }).catch(() => callback(null));
    });

    const dataDir = app.getPath('userData');
    fs.mkdirSync(dataDir, { recursive: true });
    await importLegacySettings(dataDir);

    // server.js writes credentials/tokens only to this per-user app-data folder
    // when bundled as NoteLive Studio. The web-only workflow still defaults to
    // files next to server.js when this environment value is absent.
    process.env.NOTE_LIVE_DATA_DIR = dataDir;
    process.env.NOTE_LIVE_PORT = String(PORT);

    // Public OAuth client: safe to ship the Client ID, never a Client Secret.
    process.env.NOTE_LIVE_TWITCH_PUBLIC_CLIENT = '1';
    process.env.NOTE_LIVE_TWITCH_PUBLIC_CLIENT_ID = '6fayuoirqyxpz2a1s1lliws6jahwgg';

    try {
      serverModule = require(path.join(__dirname, '..', 'server.js'));
      localServer = await serverModule.startServer();
    } catch (error) {
      await dialog.showMessageBox({
        type: 'error',
        title: `${APP_NAME} no pudo iniciarse`,
        message: error.code === 'EADDRINUSE'
          ? `El puerto ${PORT} ya está ocupado.`
          : 'No se pudo iniciar el servidor interno.',
        detail: error.code === 'EADDRINUSE'
          ? 'Cierra la versión anterior que ejecutabas con start.bat (y otras instancias de NoteLive Studio) y vuelve a abrir esta aplicación.'
          : `${error.message}\n\nComprueba que el programa esté instalado correctamente.`
      });
      app.quit();
      return;
    }

    const ready = await waitForPanel();
    if (!ready) {
      await dialog.showErrorBox(APP_NAME, 'El servidor interno arrancó, pero el panel no respondió. Cierra la aplicación e inténtalo otra vez.');
      app.quit();
      return;
    }

    buildMenu();
    await createWindow();
    configureAutoUpdates();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && localServer) createWindow();
  });

  app.on('before-quit', event => {
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    if (isQuitting || !serverModule || !localServer) return;
    event.preventDefault();
    isQuitting = true;
    Promise.resolve(serverModule.stopServer())
      .catch(error => console.warn(`[${APP_NAME}] Error al detener el servidor:`, error))
      .finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
