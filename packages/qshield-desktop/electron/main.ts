import { app, BrowserWindow, session, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import { registerIpcHandlers, type ServiceRegistry } from './ipc/handlers';
import { ConfigManager } from './services/config';

log.initialize();
log.info('QShield Desktop starting...');

let mainWindow: BrowserWindow | null = null;
let shieldWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged;

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'QShield Desktop',
    backgroundColor: '#020617',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: getPreloadPath(),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

function createShieldWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 120,
    height: 120,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: getPreloadPath(),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    win.loadURL('http://localhost:5173/#/shield-overlay');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/shield-overlay',
    });
  }

  win.on('closed', () => {
    shieldWindow = null;
  });

  return win;
}

function setupCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self' ws://localhost:* http://localhost:*",
          ].join('; '),
        ],
      },
    });
  });
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('QShield Desktop');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show QShield',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Toggle Shield Overlay',
      click: () => {
        if (shieldWindow) {
          shieldWindow.close();
          shieldWindow = null;
        } else {
          shieldWindow = createShieldWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

/** Create stub service registry for IPC handlers */
function createServiceRegistry(configManager: ConfigManager): ServiceRegistry {
  return {
    trustMonitor: {
      getState: () => ({
        score: 85,
        level: 'normal',
        signals: [],
        lastUpdated: new Date().toISOString(),
        sessionId: 'default',
      }),
      subscribe: () => log.info('Trust subscription started'),
      unsubscribe: () => log.info('Trust subscription stopped'),
    },
    evidenceStore: {
      list: () => ({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false }),
      get: (id: string) => ({ id, hash: '', previousHash: null, timestamp: new Date().toISOString(), source: 'zoom', eventType: '', payload: {}, verified: false }),
      verify: () => ({ valid: true, errors: [] }),
      search: () => ({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false }),
      export: () => ({ ok: true }),
    },
    certGenerator: {
      generate: () => ({ id: '', sessionId: '', generatedAt: new Date().toISOString() }),
      list: () => [],
    },
    gatewayClient: {
      getStatus: () => ({ connected: false, url: '' }),
      connect: (url: string) => {
        log.info('Connecting to gateway:', url);
        return { connected: true, url };
      },
      disconnect: () => ({ connected: false }),
    },
    policyEnforcer: {
      getPolicy: () => ({ rules: [], escalation: { channels: [], cooldownMinutes: 15 }, autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 } }),
      updatePolicy: (config: unknown) => config,
    },
    alertService: {
      list: () => [],
      dismiss: (id: string) => ({ id, dismissed: true }),
    },
    configManager: {
      get: (key: string) => configManager.get(key),
      set: (key: string, value: unknown) => configManager.set(key, value),
    },
    adapterManager: {
      getStatus: () => [],
      enable: (id: string) => ({ id, enabled: true }),
      disable: (id: string) => ({ id, enabled: false }),
    },
  };
}

app.whenReady().then(() => {
  log.info('App ready, initializing...');

  setupCSP();

  const configManager = new ConfigManager();
  const services = createServiceRegistry(configManager);
  registerIpcHandlers(services);

  mainWindow = createMainWindow();
  createTray();

  log.info('QShield Desktop initialized');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  }
});

app.on('before-quit', () => {
  log.info('QShield Desktop shutting down...');
  tray?.destroy();
});
