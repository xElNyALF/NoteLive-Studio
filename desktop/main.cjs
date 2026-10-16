'use strict';

const { app, BrowserWindow, dialog, shell, Menu, desktopCapturer, session, ipcMain, screen } = require('electron');
const packageInfo = require('../package.json');
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
    const publish = packageInfo.build?.publish;
    const targets = Array.isArray(publish) ? publish : (publish ? [publish] : []);
    const github = targets.find(item => item?.provider === 'github');
    return Boolean(github && github.owner && github.repo &&
      github.owner !== 'YOUR_GITHUB_USERNAME' &&
      !String(github.owner).includes('YOUR_') &&
      !String(github.repo).includes('YOUR_'));
  }

  function refreshMenu() {
    if (mainWindow && !mainWindow.isDestroyed()) buildMenu();
  }

  function checkForUpdates(manual = false) {
    manualUpdateCheck = manual;
    if (!app.isPackaged) {
      if (manual) dialog.showMessageBox(mainWindow, {
        type: 'info', title: `${APP_NAME} · Actualizaciones`,
        message: 'La búsqueda de actualizaciones solo está activa en la versión instalada.',
        detail: 'Primero hay que compilar e instalar una versión publicada.'
      });
      return;
    }
    if (!updateRepositoryConfigured()) {
      if (manual) dialog.showMessageBox(mainWindow, {
        type: 'warning', title: `${APP_NAME} · Actualizaciones sin configurar`,
        message: 'Falta enlazar el repositorio oficial de actualizaciones.',
        detail: 'Configura build.publish.owner y build.publish.repo en package.json y publica una versión en GitHub Releases.'
      });
      return;
    }
    autoUpdater.checkForUpdates().catch(error => {
      // The updater's error event handles user-facing messages for manual checks.
      console.error(`[${APP_NAME}] No se pudo comprobar actualizaciones:`, error);
    });
  }

  function configureAutoUpdates() {
    if (!app.isPackaged || !updateRepositoryConfigured()) return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      console.log(`[${APP_NAME}] Buscando actualizaciones…`);
    });
    autoUpdater.on('update-available', info => {
      console.log(`[${APP_NAME}] Actualización disponible: ${info.version}`);
      if (manualUpdateCheck && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: `${APP_NAME} · Actualización disponible`,
          message: `Se descargará NoteLive Studio ${info.version}.`,
          detail: 'Puedes seguir usando la aplicación mientras se descarga. Se te ofrecerá reiniciar cuando esté lista.'
        });
      }
    });
    autoUpdater.on('update-not-available', info => {
      if (manualUpdateCheck && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: `${APP_NAME} · Actualizaciones`,
          message: 'Ya tienes la versión más reciente.',
          detail: `Versión instalada: ${app.getVersion()}`
        });
      }
      manualUpdateCheck = false;
    });
    autoUpdater.on('download-progress', progress => {
      console.log(`[${APP_NAME}] Descarga de actualización: ${Math.round(progress.percent)}%`);
    });
    autoUpdater.on('update-downloaded', async info => {
      updateReady = true;
      refreshMenu();
      if (!mainWindow || mainWindow.isDestroyed()) {
        manualUpdateCheck = false;
        return; // The update will install on the next normal app quit.
      }
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info', title: `${APP_NAME} · Actualización lista`,
        message: `NoteLive Studio ${info.version} se descargó correctamente.`,
        detail: 'Puedes reiniciar ahora para instalarla o seguir trabajando. Si eliges más tarde, se instalará al cerrar la aplicación normalmente.',
        buttons: ['Reiniciar y actualizar', 'Más tarde'],
        defaultId: 0, cancelId: 1, noLink: true
      });
      if (result.response === 0) autoUpdater.quitAndInstall();
      manualUpdateCheck = false;
    });
    autoUpdater.on('error', error => {
      console.error(`[${APP_NAME}] Error del actualizador:`, error);
      if (manualUpdateCheck && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning', title: `${APP_NAME} · Error de actualización`,
          message: 'El actualizador encontró un problema.',
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
