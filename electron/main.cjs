const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  net,
  protocol,
  session,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_NAME = 'World of Adventure';
const APP_SCHEME = 'app';
const APP_HOST = 'worldofadventure';
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || '';
const IS_DEV = Boolean(DEV_SERVER_URL) && !app.isPackaged;

app.setName(APP_NAME);
app.commandLine.appendSwitch('high-dpi-support', '1');

// Register custom secure scheme before app is ready so Vite's ES modules,
// relative ./assets/* paths, WebGL, and persistent localStorage saves work offline.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

function resolveDistFile(requestUrl) {
  let pathname = '/index.html';
  try {
    const parsed = new URL(requestUrl);
    pathname = decodeURIComponent(parsed.pathname || '/');
  } catch {
    pathname = '/index.html';
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const relativePath = pathname.replace(/^\/+/, '');
  const candidate = path.resolve(DIST_DIR, relativePath);

  // Prevent directory traversal outside dist/
  if (!candidate.startsWith(DIST_DIR)) {
    return path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }

  return path.join(DIST_DIR, 'index.html');
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const filePath = resolveDistFile(request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function configureSessionPermissions() {
  const defaultSession = session.defaultSession;
  if (!defaultSession) return;

  const allowedPermissions = new Set([
    'pointerLock',
    'fullscreen',
    'media',
  ]);

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0d1712',
    show: false,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: IS_DEV,
      backgroundThrottling: false,
    },
  });

  if (!IS_DEV) {
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Support F11 fullscreen toggle cleanly & block browser/DevTools shortcuts in production
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'F11') {
      event.preventDefault();
      if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
      return;
    }

    if (!IS_DEV) {
      const ctrlOrMeta = input.control || input.meta;
      const lowerKey = input.key.toLowerCase();
      const isDevToolsShortcut =
        input.key === 'F12' ||
        (ctrlOrMeta && input.shift && (lowerKey === 'i' || lowerKey === 'j' || lowerKey === 'c'));
      const isReloadShortcut =
        input.key === 'F5' || (ctrlOrMeta && lowerKey === 'r');

      if (isDevToolsShortcut || isReloadShortcut) {
        event.preventDefault();
      }
    }
  });

  // Keep navigation strictly inside the local app
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (IS_DEV && targetUrl.startsWith(DEV_SERVER_URL)) {
      return;
    }
    if (!IS_DEV && targetUrl.startsWith(`${APP_SCHEME}://${APP_HOST}`)) {
      return;
    }
    event.preventDefault();
  });

  if (IS_DEV) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
  }
}

ipcMain.handle('desktop:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('desktop:is-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

ipcMain.handle('desktop:quit-app', () => {
  app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  if (!IS_DEV) {
    registerAppProtocol();
  }
  configureSessionPermissions();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
