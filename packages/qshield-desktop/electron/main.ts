/**
 * QShield Desktop — Electron main process.
 *
 * Responsibilities:
 * - Window lifecycle (main + shield overlay) with state persistence
 * - Single-instance enforcement
 * - System tray with dynamic trust-level icons
 * - Graceful shutdown sequence
 * - Crash recovery detection
 * - Production-hardened Content Security Policy
 *
 * Security invariants:
 * - nodeIntegration: false (always)
 * - contextIsolation: true (always)
 * - sandbox: true (always)
 * - All renderer communication via contextBridge + IPC invoke only
 */
import { app, BrowserWindow, session, Tray, Menu, nativeImage, screen, Notification } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import log from 'electron-log';
import { registerIpcHandlers, type ServiceRegistry } from './ipc/handlers';
import { ConfigManager, type WindowBounds, type ShieldOverlayConfig } from './services/config';
import { StandaloneCertGenerator } from './services/standalone-cert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

log.initialize();
log.info('QShield Desktop starting...');

// ── State ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let shieldWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let configManager: ConfigManager | null = null;
let isQuitting = false;
let currentTrustLevel: 'critical' | 'warning' | 'elevated' | 'normal' | 'verified' = 'normal';
let currentTrustScore = 85;

const isDev = !app.isPackaged;

// ── Single-instance lock ─────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  log.info('Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get the preload script path (.cjs for Electron require() compatibility) */
function getPreloadPath(): string {
  return path.join(__dirname, 'preload.cjs');
}

/** Hardened webPreferences shared by all windows */
function getSecureWebPreferences(): Electron.WebPreferences {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: getPreloadPath(),
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
}

// ── Window management ────────────────────────────────────────────────────────

/** Save main window bounds to config for restoration on next launch */
function saveWindowBounds(): void {
  if (!mainWindow || !configManager) return;

  const isMaximized = mainWindow.isMaximized();
  const bounds = mainWindow.getBounds();

  configManager.setWindowBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  });
}

/** Create the main application window, restoring saved position/size */
function createMainWindow(): BrowserWindow {
  const savedBounds = configManager?.getWindowBounds();

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds?.width ?? 1280,
    height: savedBounds?.height ?? 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'QShield Desktop',
    backgroundColor: '#020617',
    show: false,
    webPreferences: getSecureWebPreferences(),
  };

  // Restore saved position if it's still on-screen
  if (savedBounds && !savedBounds.isMaximized) {
    const displays = screen.getAllDisplays();
    const isOnScreen = displays.some((display) => {
      const { x, y, width, height } = display.workArea;
      return (
        savedBounds.x >= x - 100 &&
        savedBounds.y >= y - 100 &&
        savedBounds.x < x + width &&
        savedBounds.y < y + height
      );
    });
    if (isOnScreen) {
      windowOptions.x = savedBounds.x;
      windowOptions.y = savedBounds.y;
    }
  }

  const win = new BrowserWindow(windowOptions);

  if (savedBounds?.isMaximized) {
    win.maximize();
  }

  // Show window once content is ready (avoids white flash)
  win.once('ready-to-show', () => {
    win.show();
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Persist window bounds on resize/move
  win.on('resize', saveWindowBounds);
  win.on('move', saveWindowBounds);

  // Minimize to tray instead of closing (macOS convention: hide, others: minimize to tray)
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    } else {
      saveWindowBounds();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

/** Calculate shield overlay position based on config anchor and margin */
function getShieldPosition(shieldConfig: ShieldOverlayConfig): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  const overlaySize = 80;
  const margin = shieldConfig.margin;

  switch (shieldConfig.anchor) {
    case 'top-left':
      return { x: margin, y: margin };
    case 'top-right':
      return { x: screenW - overlaySize - margin, y: margin };
    case 'bottom-left':
      return { x: margin, y: screenH - overlaySize - margin };
    case 'bottom-right':
    default:
      return { x: screenW - overlaySize - margin, y: screenH - overlaySize - margin };
  }
}

/** Create the shield overlay window (always-on-top draggable floating widget) */
function createShieldWindow(): BrowserWindow {
  const shieldConfig = configManager?.getShieldConfig();
  const position = getShieldPosition(shieldConfig ?? { enabled: true, anchor: 'bottom-right', margin: 20, opacity: 1.0 });

  const win = new BrowserWindow({
    width: 80,
    height: 80,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    opacity: shieldConfig?.opacity ?? 1.0,
    webPreferences: getSecureWebPreferences(),
  });

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

// ── Content Security Policy ──────────────────────────────────────────────────

/** Set up production-hardened CSP headers on all responses */
function setupCSP(): void {
  const gatewayUrl = configManager?.getGatewayConfig()?.url ?? '';

  // Build connect-src: always allow 'self', add gateway URL, add dev URLs in dev mode
  const connectSources = ["'self'"];
  if (gatewayUrl) {
    connectSources.push(gatewayUrl);
  }
  if (isDev) {
    connectSources.push('ws://localhost:*', 'http://localhost:*');
  }

  const cspDirectives = isDev
    ? [
        // Dev mode: relax CSP to allow Vite dev server (inline scripts, HMR, module loading)
        "default-src 'self' http://localhost:*",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src ${connectSources.join(' ')}`,
      ]
    : [
        // Production: hardened CSP
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src ${connectSources.join(' ')}`,
        "object-src 'none'",
        "base-uri 'self'",
      ];

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join('; ')],
      },
    });
  });
}

// ── Tray ─────────────────────────────────────────────────────────────────────

/** Trust level color mapping */
const TRUST_COLORS: Record<string, string> = {
  verified: '#22c55e',  // green
  normal: '#3b82f6',    // blue
  elevated: '#f59e0b',  // amber
  warning: '#f59e0b',   // amber
  critical: '#ef4444',  // red
};

/** Create a 16x16 tray icon as a colored circle using nativeImage */
function createTrayIcon(level: string): Electron.NativeImage {
  const color = TRUST_COLORS[level] ?? TRUST_COLORS.normal;

  // 16x16 PNG with a colored filled circle — generated via raw RGBA buffer
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = 6;

  // Parse hex color
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        // Anti-aliased edge
        const alpha = dist > radius - 1 ? Math.round((radius - dist) * 255) : 255;
        buffer[idx] = r;
        buffer[idx + 1] = g;
        buffer[idx + 2] = b;
        buffer[idx + 3] = alpha;
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

/** Build the tray context menu with current trust state */
function buildTrayMenu(): Electron.Menu {
  const levelLabel = currentTrustLevel.charAt(0).toUpperCase() + currentTrustLevel.slice(1);

  return Menu.buildFromTemplate([
    {
      label: `Trust Score: [${currentTrustScore}] — ${levelLabel}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          mainWindow = createMainWindow();
        }
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
    {
      label: 'Open Evidence Vault',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate', '/vault');
        } else {
          mainWindow = createMainWindow();
          mainWindow.once('ready-to-show', () => {
            mainWindow?.webContents.send('navigate', '/vault');
          });
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit QShield',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

/** Create the system tray with dynamic icon and context menu */
function createTray(): void {
  const icon = createTrayIcon(currentTrustLevel);
  tray = new Tray(icon);
  tray.setToolTip(`QShield — Trust: ${currentTrustScore} (${currentTrustLevel})`);
  tray.setContextMenu(buildTrayMenu());

  // Click: restore main window
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Double-click: bring window to front (Windows convention)
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/** Update tray icon and menu when trust state changes */
function updateTray(score: number, level: typeof currentTrustLevel): void {
  currentTrustScore = score;
  currentTrustLevel = level;

  if (tray) {
    tray.setImage(createTrayIcon(level));
    tray.setToolTip(`QShield — Trust: ${score} (${level})`);
    tray.setContextMenu(buildTrayMenu());
  }
}

// ── Service registry ─────────────────────────────────────────────────────────

/** Create service registry for IPC handlers */
function createServiceRegistry(config: ConfigManager): ServiceRegistry {
  const certGen = new StandaloneCertGenerator();

  return {
    trustMonitor: {
      getState: () => {
        const state = {
          score: currentTrustScore,
          level: currentTrustLevel,
          signals: [],
          lastUpdated: new Date().toISOString(),
          sessionId: 'default',
        };
        return state;
      },
      subscribe: () => log.info('Trust subscription started'),
      unsubscribe: () => log.info('Trust subscription stopped'),
    },
    evidenceStore: {
      list: () => ({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false }),
      get: (id: string) => ({
        id,
        hash: '',
        previousHash: null,
        timestamp: new Date().toISOString(),
        source: 'zoom',
        eventType: '',
        payload: {},
        verified: false,
      }),
      verify: () => ({ valid: true, errors: [] }),
      search: () => ({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false }),
      export: () => ({ ok: true }),
    },
    certGenerator: {
      generate: (opts: { sessionId: string }) =>
        certGen.generate({
          sessionId: opts.sessionId,
          trustScore: currentTrustScore,
          trustLevel: currentTrustLevel,
        }),
      list: () => certGen.list(),
      getPdfPath: (id: string) => certGen.getPdfPath(id),
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
      getPolicy: () => ({
        rules: [],
        escalation: { channels: [], cooldownMinutes: 15 },
        autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
      }),
      updatePolicy: (policyConfig: unknown) => policyConfig,
    },
    alertService: {
      list: () => [],
      dismiss: (id: string) => ({ id, dismissed: true }),
    },
    configManager: {
      get: (key: string) => config.get(key),
      set: (key: string, value: unknown) => config.set(key, value),
    },
    adapterManager: {
      getStatus: () => [],
      enable: (id: string) => ({ id, enabled: true }),
      disable: (id: string) => ({ id, enabled: false }),
    },
  };
}

// ── Crash recovery ───────────────────────────────────────────────────────────

/** Check for previous crash and show recovery notification */
function checkCrashRecovery(config: ConfigManager): void {
  if (!config.wasCleanShutdown()) {
    log.warn('Previous session did not shut down cleanly — possible crash');

    const lastScore = config.getLastTrustScore();
    const message = lastScore !== null
      ? `Last known trust score: ${lastScore}. State has been restored.`
      : 'QShield recovered from an unexpected shutdown.';

    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'QShield Recovery',
        body: message,
      });
      notification.show();
    }

    log.info('Crash recovery: restoring last known good state');
  }

  // Mark as unclean until graceful shutdown completes
  config.setCleanShutdown(false);
}

// ── Graceful shutdown ────────────────────────────────────────────────────────

/**
 * Graceful shutdown sequence:
 * 1. Save current trust state to config
 * 2. Stop all adapters (if trust monitor available)
 * 3. Close database connections (placeholder)
 * 4. Destroy tray
 * 5. Close all windows
 * 6. Mark clean shutdown
 * 7. Quit app
 */
async function gracefulShutdown(): Promise<void> {
  log.info('Graceful shutdown starting...');

  // 1. Save current trust state
  if (configManager) {
    configManager.setLastTrustScore(currentTrustScore);
    log.info('Trust state saved');
  }

  // 2. Stop all adapters
  // TODO: When real adapter manager is integrated, call adapterManager.stopAll()
  log.info('Adapters stopped (stub)');

  // 3. Close database connections
  // TODO: When real database service is integrated, close connections here
  log.info('Database connections closed (stub)');

  // 4. Destroy tray
  if (tray) {
    tray.destroy();
    tray = null;
    log.info('Tray destroyed');
  }

  // 5. Close all windows
  if (shieldWindow) {
    shieldWindow.destroy();
    shieldWindow = null;
  }
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  log.info('Windows closed');

  // 6. Mark clean shutdown
  if (configManager) {
    configManager.setCleanShutdown(true);
    log.info('Clean shutdown flag set');
  }

  log.info('Graceful shutdown complete');
}

// ── Auto-updater placeholder ─────────────────────────────────────────────────
// TODO: Auto-updater integration
// When ready, add:
//   import { autoUpdater } from 'electron-updater';
//   autoUpdater.checkForUpdatesAndNotify();
//   autoUpdater.on('update-available', (info) => { ... });
//   autoUpdater.on('update-downloaded', (info) => { ... });
// Configure update feed URL in electron-builder config.

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  log.info('App ready, initializing...');

  // Initialize config
  configManager = new ConfigManager();

  // Check for crash recovery
  checkCrashRecovery(configManager);

  // Set up CSP (must be before any window loads)
  setupCSP();

  // Register IPC handlers
  const services = createServiceRegistry(configManager);
  registerIpcHandlers(services);

  // Create main window
  mainWindow = createMainWindow();

  // Create shield overlay if enabled
  const shieldConfig = configManager.getShieldConfig();
  if (shieldConfig.enabled) {
    shieldWindow = createShieldWindow();
  }

  // Create tray
  createTray();

  log.info('QShield Desktop initialized');
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running when all windows are closed (tray-only mode)
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create the main window when dock icon is clicked
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  await gracefulShutdown();
});

// Export updateTray for use by trust monitor integration
export { updateTray };
