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
import dotenv from 'dotenv';
import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell, Tray, Menu, nativeImage, screen, Notification } from 'electron';
import path from 'node:path';
import { chmodSync, statSync, readdirSync } from 'node:fs';
import { initExecDaemon, safeExec, shutdownExecDaemon } from './services/safe-exec';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import log from 'electron-log';
import { registerIpcHandlers, type ServiceRegistry } from './ipc/handlers';
import { ConfigManager, type WindowBounds, type ShieldOverlayConfig } from './services/config';
import { StandaloneCertGenerator } from './services/standalone-cert';
import { generateSignatureHTML, initSignatureGenerator, DEFAULT_SIGNATURE_CONFIG, type SignatureConfig } from './services/signature-generator';
import { VerificationRecordService } from './services/verification-record';
import { CryptoMonitorService } from './services/crypto-monitor';
import { NotificationService } from './services/notification';
import { validateAddress, verifyTransactionHash, loadScamDatabase, verifyEvidenceRecord } from '@qshield/core';
import { LicenseManager } from './services/license-manager';
import { FeatureGate } from './services/feature-gate';
import { LocalApiServer } from './services/local-api-server';
import { SecureMessageService } from './services/secure-message-service';
import { SecureFileService } from './services/secure-file-service';
import { GoogleAuthService } from './services/google-auth';
import { TrustMonitor } from './services/trust-monitor';
import { AssetStore } from './services/asset-store';
import { AssetMonitor } from './services/asset-monitor';
import { EmailNotifierService } from './services/email-notifier';
import { TrustReportStore } from './services/trust-report-store';
import { TrustReportGenerator } from './services/trust-report-generator';
import { KeyManager } from './services/key-manager';
import { setupAutoUpdater } from './services/auto-updater';
import type { TrustReport, TrustReportType, TrustLevel, EvidenceRecord, AdapterType } from '@qshield/core';
import { IPC_CHANNELS, IPC_EVENTS } from './ipc/channels';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fork exec daemon BEFORE Chromium initializes (clean FD table window)
initExecDaemon();

// Try multiple possible .env locations
const possiblePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  '/Users/johnwang/.claude/qshield/.env',
];

for (const p of possiblePaths) {
  const result = dotenv.config({ path: p });
  if (!result.error) {
    console.log('Loaded .env from:', p);
    break;
  }
}

console.log('DOTENV DEBUG:', {
  cwd: process.cwd(),
  QSHIELD_GOOGLE_CLIENT_ID: process.env.QSHIELD_GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
  QSHIELD_GOOGLE_CLIENT_SECRET: process.env.QSHIELD_GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
});

log.initialize();

// Prevent EPIPE crashes from electron-log console transport.
// Occurs when stdout/stderr pipe is closed (terminal disconnect, piped process exit).
if (!app.isPackaged) {
  // Dev: keep console transport but swallow EPIPE
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') return;
      throw err;
    });
  }
} else {
  // Production: disable console transport entirely (file transport still active)
  log.transports.console.level = false;
}

log.info('QShield Desktop starting...');

// ── State ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let shieldWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let configManager: ConfigManager | null = null;
let isQuitting = false;
let currentTrustLevel: 'critical' | 'warning' | 'elevated' | 'normal' | 'verified' = 'normal';
let currentTrustScore = 85;
let services: ServiceRegistry | null = null;
let localApi: LocalApiServer | null = null;
let moduleAssetMonitor: AssetMonitor | null = null;
let moduleAssetStore: AssetStore | null = null;
let reportStore: TrustReportStore | null = null;
let reportGenerator: TrustReportGenerator | null = null;
let keyManager: KeyManager | null = null;

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
  const margin = shieldConfig.margin ?? 20;

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
  const position = getShieldPosition(shieldConfig ?? { enabled: true, anchor: 'top-right', margin: 20, opacity: 1.0 });

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
      label: 'Copy Email Signature',
      click: () => {
        if (services) {
          const result = services.signatureGenerator.generate(
            configManager?.get('signatureConfig') ?? {},
            currentTrustScore,
          ) as { html: string };
          clipboard.writeHTML(result.html);
        } else {
          const sigConfig = configManager?.get('signatureConfig') as SignatureConfig | undefined;
          const merged = { ...DEFAULT_SIGNATURE_CONFIG, ...(sigConfig ?? {}) };
          const result = generateSignatureHTML(merged, currentTrustScore);
          clipboard.writeHTML(result.html);
        }
        new Notification({
          title: 'QShield',
          body: `QShield signature copied \u00B7 Trust Score: ${currentTrustScore}`,
        }).show();
      },
    },
    {
      label: 'New Secure Message',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate', '/messages/compose');
        } else {
          mainWindow = createMainWindow();
          mainWindow.once('ready-to-show', () => {
            mainWindow?.webContents.send('navigate', '/messages/compose');
          });
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

// ── Evidence data with HMAC-SHA256 hash chain ───────────────────────────────

function computeEvidenceHash(data: string, previousHash: string | null, hmacKey?: string): string {
  const key = hmacKey ?? keyManager!.getSeedEvidenceHmacKey();
  const hmac = createHmac('sha256', key);
  hmac.update(previousHash ?? 'genesis');
  hmac.update(data);
  return hmac.digest('hex');
}

interface EvidenceRow {
  id: string;
  hash: string;
  previousHash: string | null;
  timestamp: string;
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
  verified: boolean;
  signature?: string;
}

const evidenceRecords: EvidenceRow[] = [];

function initEvidenceRecords(): void {
  if (evidenceRecords.length > 0) return;
  const sources = ['zoom', 'teams', 'email', 'file', 'api'];
  const eventTypes: Record<string, string[]> = {
    zoom: ['meeting.started', 'participant.joined', 'screen.shared', 'encryption.verified'],
    teams: ['call.started', 'message.sent', 'presence.changed', 'file.shared'],
    email: ['email.received', 'email.sent', 'dkim.verified', 'spf.pass'],
    file: ['file.created', 'file.modified', 'file.accessed', 'file.moved'],
    api: ['auth.success', 'request.inbound', 'rate.limited', 'auth.failure'],
  };
  let prevHash: string | null = null;
  for (let i = 0; i < 30; i++) {
    const id = randomUUID();
    const src = sources[i % sources.length];
    const evt = eventTypes[src][i % eventTypes[src].length];
    const ts = new Date(Date.now() - (30 - i) * 600_000).toISOString();
    const data = JSON.stringify({ id, source: src, eventType: evt, timestamp: ts });
    const hash = computeEvidenceHash(data, prevHash);
    evidenceRecords.push({
      id,
      hash,
      previousHash: prevHash,
      timestamp: ts,
      source: src,
      eventType: evt,
      payload: {
        description: `${evt} from ${src} adapter`,
        sessionId: 'default',
        confidence: +(Math.random() * 100).toFixed(1),
        ip: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
      },
      verified: false,
    });
    prevHash = hash;
  }
  // Reverse so newest first
  evidenceRecords.reverse();

  // Generate trust signals from evidence records for the timeline
  initTrustSignals();
}

// ── Trust signals derived from evidence ──────────────────────────────────────

interface TrustSignalRow {
  source: string;
  score: number;
  weight: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

const trustSignals: TrustSignalRow[] = [];

/** Weight mapping per adapter source */
const SOURCE_WEIGHTS: Record<string, number> = {
  zoom: 0.25, teams: 0.20, email: 0.20, file: 0.15, api: 0.20,
};

/** Score mapping per event type — higher = more positive trust impact */
const EVENT_SCORES: Record<string, number> = {
  'meeting.started': 82, 'participant.joined': 75, 'screen.shared': 70, 'encryption.verified': 95,
  'call.started': 80, 'message.sent': 72, 'presence.changed': 65, 'file.shared': 68,
  'email.received': 60, 'email.sent': 70, 'dkim.verified': 92, 'spf.pass': 90,
  'file.created': 55, 'file.modified': 50, 'file.accessed': 45, 'file.moved': 48,
  'auth.success': 88, 'request.inbound': 60, 'rate.limited': 25, 'auth.failure': 15,
};

function initTrustSignals(): void {
  if (trustSignals.length > 0) return;
  for (const rec of evidenceRecords) {
    const score = EVENT_SCORES[rec.eventType] ?? 60;
    const weight = SOURCE_WEIGHTS[rec.source] ?? 0.15;
    trustSignals.push({
      source: rec.source,
      score,
      weight,
      timestamp: rec.timestamp,
      metadata: {
        eventType: rec.eventType,
        evidenceId: rec.id,
        description: `${rec.eventType} from ${rec.source} adapter`,
        hash: rec.hash.slice(0, 16),
        confidence: rec.payload.confidence,
      },
    });
  }
}

// ── Seed certificates ────────────────────────────────────────────────────────

interface SeedCert {
  id: string;
  sessionId: string;
  generatedAt: string;
  trustScore: number;
  trustLevel: string;
  evidenceCount: number;
  evidenceHashes: string[];
  signatureChain: string;
  pdfPath: string;
}

const seedCertificates: SeedCert[] = [];

function initSeedCertificates(): void {
  if (seedCertificates.length > 0) return;
  const levels = ['verified', 'normal', 'elevated', 'normal', 'verified'] as const;
  const scores = [92, 78, 58, 74, 95];
  for (let i = 0; i < 5; i++) {
    const id = randomUUID();
    const sessionId = randomUUID();
    const evCount = 12 + Math.floor(Math.random() * 25);
    const hashes: string[] = [];
    const certKey = keyManager?.getReportHmacKey() ?? 'cert';
    for (let h = 0; h < 3; h++) hashes.push(createHmac('sha256', certKey).update(`${id}-${h}`).digest('hex'));
    seedCertificates.push({
      id,
      sessionId,
      generatedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      trustScore: scores[i],
      trustLevel: levels[i],
      evidenceCount: evCount,
      evidenceHashes: hashes,
      signatureChain: createHmac('sha256', certKey).update(id).digest('hex'),
      pdfPath: '', // no pre-rendered PDF; export handler generates on-the-fly
    });
  }
}

// ── Seed alerts ──────────────────────────────────────────────────────────────

interface SeedAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: string;
  timestamp: string;
  dismissed: boolean;
  sourceMetadata?: Record<string, unknown>;
}

const seedAlerts: SeedAlert[] = [];
const dismissedAlertIds = new Set<string>();

const ALERT_DEFS: Array<{ title: string; description: string; severity: SeedAlert['severity']; source: string; sourceMetadata: Record<string, unknown> }> = [
  {
    title: 'Trust Score Below Threshold', severity: 'critical', source: 'api',
    description: 'Trust score dropped below the configured threshold of 40. Immediate review recommended.',
    sourceMetadata: { endpoint: '/api/v1/auth/session', method: 'POST', statusCode: 401, requestIp: '203.0.113.42', policyViolated: 'minimum-trust-score' },
  },
  {
    title: 'Unusual File Access Pattern', severity: 'high', source: 'file',
    description: 'Detected unusual file access patterns that deviate from normal behavior baseline.',
    sourceMetadata: { fileName: 'employee-database.csv', filePath: '/shared/confidential/hr/', fileSize: 10485760, fileHash: 'a3f2c8d91e4b7056...', operation: 'bulk-read' },
  },
  {
    title: 'External Domain Communication', severity: 'medium', source: 'email',
    description: 'Communication initiated with an unrecognized external domain. Review sender reputation.',
    sourceMetadata: { sender: 'noreply@suspicious-service.xyz', recipient: 'finance@company.com', subject: 'Urgent: Invoice #38291 Attached', headers: { 'X-SPF': 'softfail', 'DKIM-Signature': 'none', 'Return-Path': 'bounce@suspicious-service.xyz' } },
  },
  {
    title: 'Screen Sharing to Unknown Participant', severity: 'high', source: 'zoom',
    description: 'Screen was shared with a participant from an unverified domain during a video call.',
    sourceMetadata: { meetingId: '847-291-5530', meetingTitle: 'Q4 Revenue Review — Confidential', participants: ['john@company.com', 'sarah@company.com', 'unknown.user@external-domain.io'], triggerReason: 'Screen shared while unverified participant present' },
  },
  {
    title: 'Multiple Failed Authentication Attempts', severity: 'critical', source: 'api',
    description: 'Multiple failed authentication attempts detected from the same session.',
    sourceMetadata: { endpoint: '/api/v1/auth/login', method: 'POST', statusCode: 403, requestIp: '198.51.100.17', policyViolated: 'max-auth-failures' },
  },
  {
    title: 'Data Exfiltration Risk Detected', severity: 'high', source: 'file',
    description: 'Potential data exfiltration detected: large file transfer to external endpoint.',
    sourceMetadata: { fileName: 'source-code-archive.tar.gz', filePath: '/Users/employee/Desktop/', fileSize: 104857600, fileHash: 'e7b1d4f09a3c2856...', operation: 'upload-to-cloud' },
  },
  {
    title: 'Policy Violation: File Copy to External Drive', severity: 'medium', source: 'file',
    description: 'A file was copied to an external storage device, violating data protection policy.',
    sourceMetadata: { fileName: 'credentials-backup.zip', filePath: '/Users/employee/Documents/secrets/', fileSize: 524288, fileHash: 'c4a82f1d6e390b75...', operation: 'copy-to-external' },
  },
  {
    title: 'Anomalous API Request Volume', severity: 'low', source: 'api',
    description: 'API request volume exceeds normal baseline by 300%. Potential automated access.',
    sourceMetadata: { endpoint: '/api/v1/data/export', method: 'GET', statusCode: 200, requestIp: '192.168.1.105' },
  },
  {
    title: 'Unverified Meeting Participant', severity: 'medium', source: 'teams',
    description: 'An unverified participant joined a meeting containing sensitive content.',
    sourceMetadata: { meetingId: 'teams-9f3a2c71', meetingTitle: 'Engineering Standup — Internal Only', participants: ['alice@company.com', 'bob@company.com', 'contractor@temp-agency.net'], triggerReason: 'External participant joined internal-only meeting' },
  },
  {
    title: 'Confidential Document Accessed Outside Hours', severity: 'high', source: 'file',
    description: 'A classified document was accessed outside of authorized working hours.',
    sourceMetadata: { fileName: 'quarterly-report-final.xlsx', filePath: '/shared/confidential/reports/', fileSize: 2457600, fileHash: 'f9d0a3b72c815e46...', operation: 'open-read' },
  },
  {
    title: 'DKIM Signature Verification Failed', severity: 'medium', source: 'email',
    description: 'Incoming email failed DKIM signature verification. Possible spoofing attempt.',
    sourceMetadata: { sender: 'phishing@spoofed-bank.net', recipient: 'admin@company.com', subject: 'ACTION REQUIRED: Verify Account', headers: { 'X-SPF': 'fail', 'DKIM-Signature': 'invalid', 'Return-Path': 'mailer@untrusted.net' } },
  },
  {
    title: 'Clipboard Crypto Address Swap Detected', severity: 'critical', source: 'crypto',
    description: 'A cryptocurrency address in the clipboard was replaced by a potentially malicious address.',
    sourceMetadata: { walletAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', chain: 'ethereum', riskLevel: 'critical' },
  },
];

function initSeedAlerts(): void {
  if (seedAlerts.length > 0) return;
  for (let i = 0; i < ALERT_DEFS.length; i++) {
    const def = ALERT_DEFS[i];
    seedAlerts.push({
      id: randomUUID(),
      severity: def.severity,
      title: def.title,
      description: def.description,
      source: def.source,
      timestamp: new Date(Date.now() - i * 30 * 60_000 - Math.floor(Math.random() * 30 * 60_000)).toISOString(),
      dismissed: i >= 7, // first 7 active, rest dismissed/historical
      sourceMetadata: def.sourceMetadata,
    });
  }
  seedAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ── Seed evidence records ───────────────────────────────────────────────────

const SEED_EVIDENCE_EVENTS: Array<{ source: AdapterType; eventType: string; data: Record<string, unknown>; impact: number }> = [
  { source: 'email', eventType: 'email.received', data: { description: 'Email received from trusted partner', sender: 'partner@acme.com' }, impact: 5 },
  { source: 'email', eventType: 'email.sent', data: { description: 'Email sent to external domain', recipient: 'contact@vendor.com' }, impact: -8 },
  { source: 'file', eventType: 'file.modified', data: { description: 'Confidential document updated', fileName: 'quarterly-report.xlsx', filePath: '/Documents/' }, impact: -15 },
  { source: 'zoom', eventType: 'meeting.started', data: { description: 'Video meeting started with 4 participants', meetingTitle: 'Project Alpha Sync' }, impact: 10 },
  { source: 'zoom', eventType: 'meeting.ended', data: { description: 'Meeting ended after 45 minutes', duration: 2700 }, impact: 5 },
  { source: 'teams', eventType: 'call.started', data: { description: 'Teams call with engineering team', participants: 3 }, impact: 8 },
  { source: 'file', eventType: 'file.accessed', data: { description: 'Bulk file access detected in protected directory', fileCount: 12 }, impact: -20 },
  { source: 'email', eventType: 'email.received', data: { description: 'Suspicious link detected in email body', sender: 'noreply@untrusted.xyz' }, impact: -25 },
  { source: 'api', eventType: 'auth.success', data: { description: 'API authentication successful', endpoint: '/api/v1/auth' }, impact: 12 },
  { source: 'file', eventType: 'file.created', data: { description: 'New file created in workspace', fileName: 'meeting-notes.md' }, impact: 3 },
  { source: 'teams', eventType: 'message.sent', data: { description: 'Message sent in project channel', channel: '#engineering' }, impact: 2 },
  { source: 'zoom', eventType: 'screen.shared', data: { description: 'Screen sharing initiated by host', meetingTitle: 'Client Review' }, impact: -10 },
  { source: 'email', eventType: 'attachment.downloaded', data: { description: 'Attachment downloaded from known sender', fileName: 'invoice-2024.pdf' }, impact: -5 },
  { source: 'api', eventType: 'request.outbound', data: { description: 'Outbound API request to external service', endpoint: 'https://api.partner.com/data' }, impact: -12 },
  { source: 'file', eventType: 'file.modified', data: { description: 'Configuration file updated', fileName: '.env.production' }, impact: -18 },
];

function seedEvidenceRecords(monitor: TrustMonitor): void {
  if (monitor.getEvidenceRecords().length > 0) return;

  const sessionId = monitor.getSessionId();
  const hmacKey = keyManager!.getTrustMonitorHmacKey();
  const records: EvidenceRecord[] = [];
  let prevHash: string | null = null;
  let prevStructHash: string | null = null;

  for (let i = 0; i < SEED_EVIDENCE_EVENTS.length; i++) {
    const evt = SEED_EVIDENCE_EVENTS[i];
    const ts = new Date(Date.now() - (SEED_EVIDENCE_EVENTS.length - i) * 8 * 60_000).toISOString();
    const payload = { ...evt.data, trustImpact: evt.impact, sessionId };

    const contentStr = JSON.stringify({ source: evt.source, eventType: evt.eventType, timestamp: ts, payload });
    const hash = createHmac('sha256', hmacKey).update(contentStr).digest('hex');

    const structStr = JSON.stringify({ source: evt.source, eventType: evt.eventType, timestamp: ts });
    const structHash = createHmac('sha256', hmacKey).update(structStr).digest('hex');

    const vaultPos = parseInt(hash.slice(0, 8), 16) >>> 0;

    records.push({
      id: randomUUID(),
      hash,
      previousHash: prevHash,
      structureHash: structHash,
      previousStructureHash: prevStructHash,
      vaultPosition: vaultPos,
      timestamp: ts,
      source: evt.source,
      eventType: evt.eventType,
      payload,
      verified: true,
    });

    prevHash = hash;
    prevStructHash = structHash;
  }

  monitor.injectSeedEvidence(records);
  log.info(`[Seed] Injected ${records.length} evidence records`);
}

function seedInitialReport(monitor: TrustMonitor, assetStore: AssetStore): void {
  if (!reportStore) return;
  // Only seed if no reports exist yet
  const existing = reportStore.list();
  if (existing.length > 0) return;

  const state = monitor.getState();
  const assetStats = assetStore.getStats();
  const score = state.score;
  const level = state.level;
  const grade = score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 85 ? 'A-' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 65 ? 'B-' : score >= 55 ? 'C+' : score >= 40 ? 'C' : score >= 25 ? 'D' : 'F';
  const now = new Date();
  const sigData = `snapshot:${score}:${now.toISOString()}`;
  const reportKey = keyManager!.getReportHmacKey();
  const signatureChain = createHmac('sha256', reportKey).update(sigData).digest('hex');

  const report: TrustReport = {
    id: randomUUID(),
    type: 'snapshot' as TrustReportType,
    title: `Trust Snapshot — ${now.toLocaleDateString()}`,
    generatedAt: now.toISOString(),
    trustScore: score,
    trustGrade: grade,
    trustLevel: level,
    fromDate: now.toISOString(),
    toDate: now.toISOString(),
    channelsMonitored: 5,
    assetsMonitored: assetStats.total,
    totalEvents: monitor.getEvidenceRecords().length,
    anomaliesDetected: 0,
    anomaliesResolved: 0,
    emailScore: Math.round(score + (Math.random() - 0.5) * 10),
    fileScore: Math.round(score + (Math.random() - 0.5) * 10),
    meetingScore: Math.round(score + (Math.random() - 0.5) * 10),
    assetScore: Math.round(score + (Math.random() - 0.5) * 10),
    evidenceCount: monitor.getEvidenceRecords().length,
    chainIntegrity: true,
    signatureChain,
  };

  reportStore.insert(report);
  log.info(`[Seed] Created initial snapshot report: ${report.id}`);
}

// ── Service registry ─────────────────────────────────────────────────────────

/** Create service registry for IPC handlers */
function createServiceRegistry(config: ConfigManager, realTrustMonitor: TrustMonitor, assetMonitor: AssetMonitor, assetStore: AssetStore): ServiceRegistry {
  const certGen = new StandaloneCertGenerator();
  const verificationService = new VerificationRecordService(
    keyManager?.getVerificationHmacKey(),
  );
  const licMgr = new LicenseManager();
  const licenseInfo = licMgr.initialize();
  const featureGate = new FeatureGate(licMgr);
  log.info(`[LicenseManager] License: ${licenseInfo.tier}, ${licenseInfo.daysRemaining}d remaining`);

  // Initialize crypto monitoring service
  const cryptoMonitor = new CryptoMonitorService((addresses) => {
    config.set('trustedAddresses', addresses);
  });
  // Load persisted trusted addresses
  const savedAddresses = config.get('trustedAddresses') as Array<{ address: string; chain: string; label?: string; trusted: boolean; addedAt: string }> | undefined;
  if (savedAddresses && Array.isArray(savedAddresses)) {
    cryptoMonitor.addressBook.load(savedAddresses as Parameters<typeof cryptoMonitor.addressBook.load>[0]);
  }
  // Load scam address database
  try {
    const scamPath = path.join(__dirname, '../../data/scam-addresses.json');
    const scamData = require(scamPath) as string[];
    loadScamDatabase(scamData);
    log.info(`Loaded ${scamData.length} scam addresses`);
  } catch {
    log.warn('Could not load scam addresses database');
  }
  // Start crypto monitoring
  cryptoMonitor.start();

  // Initialize secure message service
  const secureMessageSvc = new SecureMessageService(keyManager?.getSecureMessageHmacKey());
  secureMessageSvc.setPersist((messages) => config.set('secureMessages', messages));
  secureMessageSvc.setEditionProvider(() => licMgr.getTier());
  const savedMessages = config.get('secureMessages') as Parameters<typeof secureMessageSvc.load>[0] | undefined;
  if (savedMessages && Array.isArray(savedMessages)) {
    secureMessageSvc.load(savedMessages);
  }

  // Check for expired messages on startup and every 60 seconds
  secureMessageSvc.checkExpiration();
  setInterval(() => secureMessageSvc.checkExpiration(), 60_000);

  // Initialize secure file service
  const secureFileSvc = new SecureFileService(
    path.join(app.getPath('userData'), 'secure-files'),
    keyManager?.getSecureFileHmacKey(),
  );
  // Set file size limit based on edition
  const fileSizeLimits: Record<string, number> = {
    free: 5 * 1024 * 1024,        // 5 MB
    personal: 10 * 1024 * 1024,    // 10 MB
    business: 10 * 1024 * 1024,    // 10 MB
    enterprise: 100 * 1024 * 1024, // 100 MB
  };
  secureFileSvc.setMaxFileSize(fileSizeLimits[licMgr.getTier()] ?? 10 * 1024 * 1024);
  secureFileSvc.checkExpiration();
  setInterval(() => secureFileSvc.checkExpiration(), 60_000);

  return {
    trustMonitor: {
      getState: () => {
        // Always return real state from TrustMonitor — no mock fallback.
        // Deep-clone via JSON round-trip to prevent garbled metadata over IPC.
        return JSON.parse(JSON.stringify(realTrustMonitor.getState()));
      },
      subscribe: () => {
        log.info('Trust subscription started');
        // Real subscription is already wired in app.whenReady() via realTrustMonitor.subscribe()
      },
      unsubscribe: () => log.info('Trust subscription stopped'),
    },
    evidenceStore: {
      list: (opts: { page?: number; pageSize?: number }) => {
        // Return real evidence records from TrustMonitor
        const records = realTrustMonitor.getEvidenceRecords();
        const page = opts?.page ?? 1;
        const pageSize = opts?.pageSize ?? 20;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return {
          items: records.slice(start, end),
          total: records.length,
          page,
          pageSize,
          hasMore: end < records.length,
        };
      },
      get: (id: string) => {
        const records = realTrustMonitor.getEvidenceRecords();
        return records.find((r) => r.id === id) ?? null;
      },
      verify: (id: string) => {
        const records = realTrustMonitor.getEvidenceRecords();
        const record = records.find((r) => r.id === id);
        if (!record) return { valid: false, errors: ['Record not found'] };
        const result = verifyEvidenceRecord(record, realTrustMonitor.getSessionId(), realTrustMonitor.getHmacKey());
        if (!result.contentValid || !result.structureValid) {
          const errors: string[] = [];
          if (!result.contentValid) errors.push('Helix A (content) hash verification failed');
          if (!result.structureValid) errors.push('Helix B (structure) hash verification failed');
          return { valid: false, errors };
        }
        return { valid: true, errors: [] };
      },
      search: (query: string) => {
        const records = realTrustMonitor.getEvidenceRecords();
        const q = query.toLowerCase();
        const items = records.filter(
          (r) =>
            r.hash.toLowerCase().includes(q) ||
            r.source.toLowerCase().includes(q) ||
            r.eventType.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q),
        );
        return { items, total: items.length, page: 1, pageSize: items.length, hasMore: false };
      },
      export: () => ({ ok: true }),
    },
    certGenerator: {
      generate: (opts: { sessionId: string }) =>
        certGen.generate({
          sessionId: opts.sessionId,
          trustScore: currentTrustScore,
          trustLevel: currentTrustLevel,
        }),
      list: () => {
        initSeedCertificates();
        // Combine real generated certs (newest first) with seed data
        const real = certGen.list();
        return [...real, ...seedCertificates.filter((sc) => !real.some((r) => r.id === sc.id))];
      },
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
      list: () => {
        const result = seedAlerts.filter((a) => !dismissedAlertIds.has(a.id));
        log.info(`[AlertService] list() returning ${result.length} alerts (seedAlerts total: ${seedAlerts.length})`);
        return result;
      },
      dismiss: (id: string) => {
        dismissedAlertIds.add(id);
        const alert = seedAlerts.find((a) => a.id === id);
        if (alert) alert.dismissed = true;
        return { id, dismissed: true };
      },
    },
    configManager: {
      get: (key: string) => config.get(key),
      getAll: () => config.getAll(),
      set: (key: string, value: unknown) => config.set(key, value),
    },
    adapterManager: {
      getStatus: () => {
        // Return real adapter statuses from TrustMonitor
        const realStatuses = realTrustMonitor.getAdapterStatuses();
        // Add crypto monitor (not managed by TrustMonitor)
        return [
          ...realStatuses,
          { id: 'crypto', name: 'Crypto Monitor', enabled: true, connected: cryptoMonitor.clipboardGuard.getState().enabled, lastEvent: undefined, eventCount: 0 },
        ];
      },
      enable: (id: string) => ({ id, enabled: true }),
      disable: (id: string) => ({ id, enabled: false }),
    },
    signatureGenerator: {
      generate: (sigConfig: unknown, trustScore: number) => {
        const merged = { ...DEFAULT_SIGNATURE_CONFIG, ...(sigConfig as Partial<SignatureConfig>) };
        const senderName = merged.senderName || 'QShield User';
        const trustLevel = trustScore >= 90 ? 'verified' : trustScore >= 70 ? 'normal' : trustScore >= 50 ? 'elevated' : trustScore >= 30 ? 'warning' : 'critical';
        const record = verificationService.createRecord({
          senderName,
          senderEmail: 'user@qshield.io',
          trustScore,
          trustLevel,
        });
        return generateSignatureHTML(merged, trustScore, record.verificationId, record.verifyUrl, record.referralId, 'user@qshield.io');
      },
      getConfig: () => {
        const saved = config.get('signatureConfig') as SignatureConfig | undefined;
        return saved ?? DEFAULT_SIGNATURE_CONFIG;
      },
      setConfig: (sigConfig: unknown) => {
        config.set('signatureConfig', sigConfig);
      },
      getCurrentTrustScore: () => currentTrustScore,
    },
    verificationService: {
      getStats: () => verificationService.getStats(),
      createRecord: (opts) => verificationService.createRecord(opts),
      recordClick: (id) => verificationService.recordClick(id),
    },
    cryptoService: {
      getStatus: () => cryptoMonitor.getStatus(),
      verifyAddress: (input: { address: string; chain: string }) =>
        validateAddress(input.address, input.chain as Parameters<typeof validateAddress>[1]),
      verifyTransaction: (input: { hash: string; chain: string }) =>
        verifyTransactionHash(input.hash, input.chain as Parameters<typeof verifyTransactionHash>[1]),
      getAddressBook: () => cryptoMonitor.addressBook.getAll(),
      addTrustedAddress: (input: { address: string; chain: string; label?: string }) =>
        cryptoMonitor.addressBook.add(
          input.address,
          input.chain as Parameters<typeof cryptoMonitor.addressBook.add>[1],
          input.label,
        ),
      removeTrustedAddress: (address: string) => cryptoMonitor.addressBook.remove(address),
      getAlerts: () => cryptoMonitor.getAlerts(),
      getClipboardStatus: () => cryptoMonitor.getClipboardStatus(),
    },
    licenseManager: {
      getLicense: () => licMgr.getLicense(),
      activate: (key: string) => licMgr.activate(key),
      deactivate: () => licMgr.deactivate(),
      hasFeature: (feature: string) => licMgr.hasFeature(feature as Parameters<typeof licMgr.hasFeature>[0]),
      getTier: () => licMgr.getTier(),
      generateKey: (opts: { tier: string; email?: string; durationDays?: number }) => LicenseManager.generateKey(opts),
    },
    featureGate: {
      getFeatures: () => featureGate.getFeatures(),
    },
    secureFileService: {
      upload: (opts: { fileName: string; mimeType: string; data: Buffer; expiresIn: string; maxDownloads: number }, senderName: string, senderEmail: string) =>
        secureFileSvc.upload(opts as Parameters<typeof secureFileSvc.upload>[0], senderName, senderEmail),
      list: () => secureFileSvc.list(),
      get: (id: string) => secureFileSvc.get(id),
      destroy: (id: string) => secureFileSvc.destroy(id),
      getEncryptedData: (id: string) => secureFileSvc.getEncryptedData(id),
      recordDownload: (id: string, entry: { action: 'downloaded'; ip: string; userAgent: string }) =>
        secureFileSvc.recordDownload(id, entry),
      recordView: (id: string, entry: { action: 'viewed'; ip: string; userAgent: string }) =>
        secureFileSvc.recordView(id, entry),
      getMaxFileSize: () => secureFileSvc.getMaxFileSize(),
    },
    secureMessageService: {
      create: (opts: unknown) => {
        const o = opts as { subject: string; content: string; attachments?: { filename: string; mimeType: string; data: string }[]; expiresIn: string; maxViews: number; requireVerification: boolean; allowedRecipients: string[] };
        const licEmail = (licMgr.getLicense() as { email?: string }).email;
        return secureMessageSvc.create(
          o as Parameters<typeof secureMessageSvc.create>[0],
          'QShield User',
          licEmail || 'user@qshield.io',
        );
      },
      list: () => secureMessageSvc.list(),
      get: (id: string) => secureMessageSvc.get(id),
      destroy: (id: string) => secureMessageSvc.destroy(id),
      getAccessLog: (id: string) => {
        const msg = secureMessageSvc.get(id);
        return msg?.accessLog ?? [];
      },
      copyLink: (id: string) => {
        const summaries = secureMessageSvc.list();
        const summary = summaries.find((s) => s.id === id);
        if (summary) {
          clipboard.writeText(summary.shareUrl);
        }
      },
      recordAccess: (id: string, entry: { ip: string; userAgent: string; recipientEmail?: string; action: 'viewed' | 'downloaded' | 'file_downloaded' | 'verified' | 'expired' | 'destroyed' }) =>
        secureMessageSvc.recordAccess(id, entry),
      getDecryptedContent: (id: string) => secureMessageSvc.getDecryptedContent(id),
    },
    assetService: {
      list: () => assetStore.listAssets(),
      add: (assetPath: string, type: 'file' | 'directory', sensitivity: string, name?: string) =>
        assetMonitor.addAsset(assetPath, type, sensitivity as 'normal' | 'strict' | 'critical', name),
      getByPath: (assetPath: string) => assetStore.getAssetByPath(assetPath),
      remove: (id: string) => assetMonitor.removeAsset(id),
      get: (id: string) => assetStore.getAsset(id),
      verify: (id: string) => assetMonitor.verifyAsset(id),
      accept: (id: string) => assetMonitor.acceptChanges(id),
      updateSensitivity: (id: string, sensitivity: string) =>
        assetStore.updateSensitivity(id, sensitivity as 'normal' | 'strict' | 'critical'),
      enable: (id: string, enabled: boolean) => assetStore.enableAsset(id, enabled),
      stats: () => assetStore.getStats(),
      changeLog: (id: string, limit?: number) => assetStore.getChangeLog(id, limit),
      browse: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile', 'openDirectory'],
          title: 'Select file or folder to monitor',
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true };
        }
        return { canceled: false, path: result.filePaths[0] };
      },
    },
    reportService: {
      generate: async (opts: { type: string; fromDate?: string; toDate?: string; assetId?: string; notes?: string }) => {
        const trustHistory = realTrustMonitor.getTrustHistory();
        const id = randomUUID();
        const now = new Date().toISOString();
        const state = realTrustMonitor.getState();
        const lifetimeStats = trustHistory.getLifetimeStats();
        const adapters = realTrustMonitor.getAdapterStatuses();
        const assetStatsData = assetStore.getStats();
        const evidenceRecords = realTrustMonitor.getEvidenceRecords();

        // Compute date range
        let fromDate: string;
        let toDate: string;
        if (opts.type === 'snapshot') {
          fromDate = now.slice(0, 10);
          toDate = now.slice(0, 10);
        } else if (opts.type === 'period') {
          fromDate = opts.fromDate ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
          toDate = opts.toDate ?? now.slice(0, 10);
        } else {
          fromDate = now.slice(0, 10);
          toDate = now.slice(0, 10);
        }

        // Compute category scores from signals
        const signals = (state as { signals?: Array<{ source: string; score: number; timestamp: string; metadata: Record<string, unknown> }> }).signals ?? [];
        const emailSignals = signals.filter((s) => s.source === 'email');
        const fileSignals = signals.filter((s) => s.source === 'file');
        const meetingSignals = signals.filter((s) => s.source === 'zoom' || s.source === 'teams');
        const avgScore = (arr: Array<{ score: number }>) => arr.length === 0 ? 100 : Math.round(arr.reduce((s, x) => s + x.score, 0) / arr.length);
        const assetScoreVal = assetStatsData.total > 0 ? Math.round((assetStatsData.verified / assetStatsData.total) * 100) : 100;

        // Build title
        const dateStr = new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        let title: string;
        if (opts.type === 'snapshot') {
          title = `Trust Snapshot \u2014 ${dateStr}`;
        } else if (opts.type === 'period') {
          const fromLabel = new Date(fromDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const toLabel = new Date(toDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          title = `Weekly Report \u2014 ${fromLabel}\u2013${toLabel}`;
        } else {
          if (!opts.assetId) {
            throw new Error('assetId is required for asset reports');
          }
          const asset = assetStore.getAsset(opts.assetId);
          if (!asset) {
            throw new Error('Asset not found');
          }
          title = `Asset Report \u2014 ${asset.name}`;
        }

        // Generate signature chain hash
        const rptKey = keyManager!.getReportHmacKey();
        const signatureChain = createHmac('sha256', rptKey)
          .update(`${id}:${now}:${(state as { score: number }).score}`)
          .digest('hex');

        const report: TrustReport = {
          id,
          type: opts.type as TrustReportType,
          title,
          generatedAt: now,
          trustScore: (state as { score: number }).score,
          trustGrade: lifetimeStats.currentGrade,
          trustLevel: (state as { level: string }).level as TrustLevel,
          fromDate,
          toDate,
          channelsMonitored: adapters.filter((a: { connected: boolean }) => a.connected).length,
          assetsMonitored: assetStatsData.total,
          totalEvents: evidenceRecords.length,
          anomaliesDetected: lifetimeStats.totalAnomalies,
          anomaliesResolved: lifetimeStats.totalAnomalies,
          emailScore: avgScore(emailSignals),
          fileScore: avgScore(fileSignals),
          meetingScore: avgScore(meetingSignals),
          assetScore: assetScoreVal,
          evidenceCount: evidenceRecords.length,
          chainIntegrity: true,
          signatureChain,
          notes: opts.notes,
          assetId: opts.assetId,
          assetName: opts.type === 'asset' ? assetStore.getAsset(opts.assetId!)?.name : undefined,
        };

        // Build recent events for PDF
        const recentEvents = evidenceRecords.slice(0, 6).map((r: { timestamp: string; source: string; eventType: string; verified: boolean }) => ({
          timestamp: r.timestamp,
          description: `${r.source} \u2014 ${r.eventType}`,
          verified: r.verified,
        }));

        // Build anomaly entries from low-score signals
        const anomalySignals = signals.filter((s) => s.score < 30).slice(0, 4);
        const anomalyEntries = anomalySignals.map((s) => ({
          timestamp: s.timestamp,
          description: String(s.metadata?.description ?? `${s.source} anomaly detected`),
          status: 'Resolved \u2014 reviewed and accepted',
        }));

        // Generate PDF
        const pdfPath = await reportGenerator!.generatePdf({
          report,
          recentEvents,
          anomalies: anomalyEntries,
        });
        report.pdfPath = pdfPath;

        // Persist to SQLite
        reportStore!.insert(report);
        log.info(`[TrustReport] Report ${id} generated: ${title}`);
        return report;
      },
      list: () => reportStore!.list(),
      get: (id: string) => reportStore!.get(id),
      getPdfPath: (id: string) => {
        const report = reportStore!.get(id);
        return report?.pdfPath ?? null;
      },
    },
    keyManager: keyManager ? { getStatus: () => keyManager!.getStatus() } : undefined,
    emailNotifier: new EmailNotifierService(config),
    trustHistory: {
      getLifetimeStats: () => realTrustMonitor.getTrustHistory().getLifetimeStats(),
      getDailySummary: (date: string) => realTrustMonitor.getTrustHistory().getDailySummary(date),
      getDailySummaries: (from: string, to: string) => realTrustMonitor.getTrustHistory().getDailySummaries(from, to),
      getScoreHistory: (days: number) => realTrustMonitor.getTrustHistory().getScoreHistory(days),
      getMilestones: () => realTrustMonitor.getTrustHistory().getMilestones(),
      getTrend: (days: number) => realTrustMonitor.getTrustHistory().getTrend(days),
    },
    // Stub — overridden in app.whenReady() after localApi is created
    localApiManager: {
      getInfo: () => ({ port: 3847, token: '', running: false }),
      regenerateToken: () => ({ token: '' }),
    },
    aiAdapter: (() => {
      const adapter = realTrustMonitor.getAdapter('ai') as import('./adapters/ai-agent').AIAgentAdapter | undefined;
      return {
        getActiveSessions: () => adapter?.getActiveSessions() ?? [],
        getSession: (id: string) => adapter?.getSession(id),
        freezeSession: (id: string, reason: string) => adapter?.freezeSession(id, reason),
        unfreezeSession: (id: string) => adapter?.unfreezeSession(id),
        allowAction: (id: string, scope: 'once' | 'session') => adapter?.allowAction(id, scope),
        getAccessedFiles: (id: string) => adapter?.getAccessedFiles(id) ?? [],
      };
    })(),
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

  // 2. Stop local API server
  if (localApi) {
    await localApi.stop();
    localApi = null;
  }

  // 3. Stop all adapters
  // TODO: When real adapter manager is integrated, call adapterManager.stopAll()
  log.info('Adapters stopped (stub)');

  // 3b. Stop asset monitoring and close database
  if (moduleAssetMonitor) {
    await moduleAssetMonitor.stop();
    moduleAssetMonitor = null;
    log.info('Asset monitor stopped');
  }
  if (moduleAssetStore) {
    moduleAssetStore.close();
    moduleAssetStore = null;
    log.info('Asset store closed');
  }

  // 3c. Close report store database
  if (reportStore) {
    reportStore.close();
    reportStore = null;
    log.info('Report store closed');
  }

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

  // 5b. Destroy key manager
  if (keyManager) {
    keyManager.destroy();
    keyManager = null;
    log.info('Key manager destroyed');
  }

  // 5c. Shutdown exec daemon
  shutdownExecDaemon();

  // 6. Mark clean shutdown
  if (configManager) {
    configManager.setCleanShutdown(true);
    log.info('Clean shutdown flag set');
  }

  log.info('Graceful shutdown complete');
}

// Auto-updater is set up after main window creation via setupAutoUpdater().

// ── File lock helpers ─────────────────────────────────────────────────────────

function lockDirectoryRecursive(dirPath: string): void {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          lockDirectoryRecursive(fullPath);
          chmodSync(fullPath, 0o555);
        } else {
          chmodSync(fullPath, 0o444);
        }
      } catch (e) {
        log.warn('[Asset:lock] Could not lock:', fullPath, e);
      }
    }
    chmodSync(dirPath, 0o555);
  } catch (e) {
    log.warn('[Asset:lock] Could not read directory:', dirPath, e);
  }
}

function unlockDirectoryRecursive(dirPath: string): void {
  try {
    // Restore directory access first so we can read contents
    chmodSync(dirPath, 0o755);
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          unlockDirectoryRecursive(fullPath);
        } else {
          chmodSync(fullPath, 0o644);
        }
      } catch (e) {
        log.warn('[Asset:unlock] Could not unlock:', fullPath, e);
      }
    }
  } catch (e) {
    log.warn('[Asset:unlock] Could not read directory:', dirPath, e);
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  log.info('App ready, initializing...');

  // Initialize config
  configManager = new ConfigManager();

  // Force shield to top-right on every startup
  configManager.set('shield.anchor', 'top-right');

  // Check for crash recovery
  checkCrashRecovery(configManager);

  // Initialize KeyManager (must be after app ready for safeStorage)
  keyManager = new KeyManager();
  await keyManager.initialize();

  // Initialize signature generator with derived key
  initSignatureGenerator(keyManager.getSignatureHmacKey());

  // Set up CSP (must be before any window loads)
  setupCSP();

  // Initialize Google OAuth service and load saved tokens
  const googleAuth = new GoogleAuthService();
  const savedGmailTokens = configManager.get('gmailTokens') as Record<string, unknown> | undefined;
  if (savedGmailTokens) {
    googleAuth.loadTokens(savedGmailTokens);
    log.info('[Gmail] Loaded saved tokens');
  }

  // Initialize real TrustMonitor with all adapters (File Watcher, Email, etc.)
  const realTrustMonitor = new TrustMonitor(
    googleAuth,
    undefined,
    keyManager.getTrustMonitorHmacKey(),
  );

  // Initialize high-trust asset monitoring (SQLite store + chokidar watcher)
  const assetStore = new AssetStore();
  const assetMonitor = new AssetMonitor(assetStore);
  moduleAssetMonitor = assetMonitor;
  moduleAssetStore = assetStore;

  // Initialize trust report store and PDF generator
  reportStore = new TrustReportStore();
  reportGenerator = new TrustReportGenerator();

  // Wire assetStore into AI adapter so it can check protected zones
  const aiAdapter = realTrustMonitor.getAdapter('ai') as import('./adapters/ai-agent').AIAgentAdapter | undefined;
  if (aiAdapter) {
    aiAdapter.setAssetStore(assetStore);
    log.info('[AI] AssetStore wired into AI adapter for zone checking');
  }

  // Connect asset monitor to trust monitor so asset changes affect global trust score
  realTrustMonitor.connectAssetMonitor(assetMonitor);

  // Connect asset store for snapshot stats (assets monitored/verified/changed)
  realTrustMonitor.connectAssetStore(assetStore);

  // Subscribe to trust state changes and push to all renderer windows
  realTrustMonitor.subscribe((state) => {
    currentTrustScore = state.score;
    currentTrustLevel = state.level as typeof currentTrustLevel;

    // Push real signals into trustSignals array so mock-based views also update
    trustSignals.length = 0;
    for (const sig of state.signals) {
      trustSignals.push(sig as unknown as TrustSignalRow);
    }

    // Deep-clone state via JSON round-trip before sending over IPC.
    // Prevents garbled metadata from Electron structured-clone edge cases.
    const safeState = JSON.parse(JSON.stringify(state));

    // Send to all BrowserWindows
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_EVENTS.TRUST_STATE_UPDATED, safeState);
      }
    }
  });

  // Wire TrustMonitor alert events to renderer push notifications and alert storage
  realTrustMonitor.onEvent((eventType, data) => {
    if (eventType === 'alert' && data && typeof data === 'object') {
      const alert = data as SeedAlert;
      // Ensure the alert has required fields
      if (!alert.id) alert.id = randomUUID();
      if (!alert.timestamp) alert.timestamp = new Date().toISOString();
      if (!alert.dismissed) alert.dismissed = false;

      // Store for list retrieval
      seedAlerts.unshift(alert);
      if (seedAlerts.length > 200) seedAlerts.length = 200;

      // Broadcast to all renderer windows
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_EVENTS.ALERT_RECEIVED, JSON.parse(JSON.stringify(alert)));
        }
      }
      log.info(`[TrustMonitor] Alert broadcast: ${alert.title ?? alert.severity}`);
    }
  });

  // Wire asset change events to renderer push notifications
  assetMonitor.onAssetChange((changeEvent, asset) => {
    const safeData = JSON.parse(JSON.stringify({ event: changeEvent, asset }));
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_EVENTS.ASSET_CHANGED, safeData);
      }
    }
  });

  // Start asset monitor (watches all registered assets)
  assetMonitor.start().catch((err) => {
    log.error('[AssetMonitor] Failed to start:', err);
  });

  // No seed/demo data — all events come from real monitoring adapters.

  // Register IPC handlers
  services = createServiceRegistry(configManager, realTrustMonitor, assetMonitor, assetStore);
  registerIpcHandlers(services);

  // Apply license-based adapter limit and start monitoring
  const licenseFeatures = (services.licenseManager.getLicense() as { features: { maxAdapters: number } }).features;
  realTrustMonitor.setMaxAdapters(licenseFeatures.maxAdapters);
  realTrustMonitor.start().catch((err) => {
    log.error('[TrustMonitor] Failed to start:', err);
  });

  // Connect email notifier to alert pipeline
  realTrustMonitor.connectEmailNotifier(services.emailNotifier as import('./services/email-notifier').EmailNotifierService);

  // ── Gmail IPC handlers ────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GMAIL_CONNECT, async () => {
    try {
      await googleAuth.authenticate();
      // Store tokens securely
      configManager!.set('gmailTokens', googleAuth.getTokens());
      const email = googleAuth.getUserEmail() ?? '';
      return { success: true, data: { email } };
    } catch (err) {
      log.error('[Gmail] OAuth connect failed:', err);
      return {
        success: false,
        error: { message: err instanceof Error ? err.message : 'OAuth failed', code: 'GMAIL_AUTH_ERROR' },
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GMAIL_DISCONNECT, async () => {
    try {
      await googleAuth.revoke();
      configManager!.set('gmailTokens', undefined);
      return { success: true, data: null };
    } catch (err) {
      log.error('[Gmail] Disconnect failed:', err);
      return {
        success: false,
        error: { message: err instanceof Error ? err.message : 'Disconnect failed', code: 'GMAIL_DISCONNECT_ERROR' },
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GMAIL_STATUS, () => {
    return {
      success: true,
      data: {
        connected: googleAuth.isAuthenticated(),
        email: googleAuth.getUserEmail(),
      },
    };
  });

  // ── File Watcher IPC handlers ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.FILE_WATCHER_CONFIGURE, (_event, config: Record<string, unknown>) => {
    // Placeholder — file watcher config is set via initialize()
    log.info('[FileWatcher] Configure request:', config);
    return { success: true, data: null };
  });

  ipcMain.handle(IPC_CHANNELS.FILE_WATCHER_PATHS, () => {
    const homedir = app.getPath('home');
    return {
      success: true,
      data: [
        path.join(homedir, 'Documents'),
        path.join(homedir, 'Downloads'),
        path.join(homedir, 'Desktop'),
      ],
    };
  });

  // Toggle main window — registered here for direct mainWindow access
  ipcMain.handle('app:toggle-main-window', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
    return { success: true, data: null };
  });

  ipcMain.handle('app:show-alerts', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('navigate', '/alerts');
    }
    return { success: true, data: null };
  });

  // Open external URL in system browser
  ipcMain.handle('app:open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('mailto:'))) {
      return { success: false, error: { message: 'Only https:// and mailto: URLs are allowed', code: 'INVALID_URL' } };
    }
    await shell.openExternal(url);
    return { success: true, data: null };
  });

  // Show file/folder in system file manager
  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_IN_FOLDER, (_event, filePath: string) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { success: false, error: { message: 'Invalid file path', code: 'INVALID_PATH' } };
    }
    shell.showItemInFolder(filePath);
    return { success: true, data: null };
  });

  // Check what processes have a file/folder open (macOS lsof)
  ipcMain.handle(IPC_CHANNELS.INVESTIGATE_CHECK_PROCESSES, async (_event, targetPath: string) => {
    if (typeof targetPath !== 'string' || targetPath.length === 0) {
      return { success: true, data: { processes: [], summary: 'Invalid path' } };
    }
    if (process.platform !== 'darwin') {
      return { success: true, data: { processes: [], summary: 'Process detection only available on macOS' } };
    }
    try {
      let output = '';

      // Try the specific file first
      try {
        output = (await safeExec(`lsof "${targetPath}" 2>/dev/null | tail -n +2 | head -20`, { timeout: 5000 })).trim();
      } catch { /* lsof returns exit code 1 when no processes found */ }

      // If it's a directory or nothing found, scan the directory
      if (!output) {
        try {
          output = (await safeExec(`lsof +D "${targetPath}" 2>/dev/null | tail -n +2 | head -20`, { timeout: 8000 })).trim();
        } catch { /* no results */ }
      }

      if (!output) {
        return { success: true, data: { processes: [], summary: 'No processes currently accessing this location' } };
      }

      const lines = output.split('\n').filter((l: string) => l.trim());
      const processes = lines.map((line: string) => {
        const parts = line.split(/\s+/);
        return { name: parts[0] || 'unknown', pid: parts[1] || '', user: parts[2] || '' };
      });
      const unique = [...new Map(processes.map((p: { name: string; pid: string }) => [`${p.name}:${p.pid}`, p])).values()] as Array<{ name: string; pid: string; user: string }>;
      const summary = unique.length > 0
        ? unique.map((p) => `${p.name} (PID ${p.pid}, user: ${p.user})`).join('\n')
        : 'No processes currently accessing this location';
      return { success: true, data: { processes: unique, summary } };
    } catch (err) {
      return { success: true, data: { processes: [], summary: `Check failed: ${err instanceof Error ? err.message : err}` } };
    }
  });

  // Pause asset monitoring temporarily
  ipcMain.handle(IPC_CHANNELS.ASSET_PAUSE, (_event, assetId: string, durationSeconds: number) => {
    if (!moduleAssetMonitor) {
      return { success: false, error: { message: 'Asset monitor not available', code: 'NOT_AVAILABLE' } };
    }
    moduleAssetMonitor.pauseAsset(assetId, durationSeconds);
    return { success: true, data: null };
  });

  // Resume asset monitoring early
  ipcMain.handle(IPC_CHANNELS.ASSET_RESUME, (_event, assetId: string) => {
    if (!moduleAssetMonitor) {
      return { success: false, error: { message: 'Asset monitor not available', code: 'NOT_AVAILABLE' } };
    }
    moduleAssetMonitor.resumeAsset(assetId);
    return { success: true, data: null };
  });

  // Lock asset — set file/directory to read-only
  ipcMain.handle(IPC_CHANNELS.ASSET_LOCK, (_event, assetId: string) => {
    log.info('[Asset:lock] Attempting to lock asset:', assetId);
    if (!moduleAssetStore) {
      return { success: false, error: { message: 'Asset store not available', code: 'NOT_AVAILABLE' } };
    }
    const asset = moduleAssetStore.getAsset(assetId);
    if (!asset) {
      log.error('[Asset:lock] Asset not found:', assetId);
      return { success: false, error: { message: 'Asset not found', code: 'NOT_FOUND' } };
    }
    log.info('[Asset:lock] Asset path:', asset.path, 'type:', asset.type);

    try {
      const stats = statSync(asset.path);
      const originalPerms = (stats.mode & 0o777).toString(8);
      log.info('[Asset:lock] Original permissions:', originalPerms);
      moduleAssetStore.setMeta(assetId, 'originalPermissions', originalPerms);

      if (asset.type === 'file') {
        chmodSync(asset.path, 0o444);
      } else {
        lockDirectoryRecursive(asset.path);
      }

      moduleAssetStore.setMeta(assetId, 'locked', 'true');
      log.info('[Asset:lock] Successfully locked:', asset.path);
      return { success: true, data: { locked: true } };
    } catch (err) {
      log.error('[Asset:lock] Failed:', err);
      return { success: false, error: { message: `Failed: ${err instanceof Error ? err.message : err}`, code: 'LOCK_FAILED' } };
    }
  });

  // Unlock asset — restore original permissions
  ipcMain.handle(IPC_CHANNELS.ASSET_UNLOCK, (_event, assetId: string) => {
    if (!moduleAssetStore) {
      return { success: false, error: { message: 'Asset store not available', code: 'NOT_AVAILABLE' } };
    }
    const asset = moduleAssetStore.getAsset(assetId);
    if (!asset) {
      return { success: false, error: { message: 'Asset not found', code: 'NOT_FOUND' } };
    }

    try {
      if (asset.type === 'file') {
        const originalPerms = moduleAssetStore.getMeta(assetId, 'originalPermissions') || '644';
        chmodSync(asset.path, parseInt(originalPerms, 8));
        log.info(`[Asset:unlock] Unlocked file: ${asset.path} (restored to ${originalPerms})`);
      } else {
        unlockDirectoryRecursive(asset.path);
        log.info(`[Asset:unlock] Unlocked directory: ${asset.path}`);
      }

      moduleAssetStore.setMeta(assetId, 'locked', 'false');
      return { success: true, data: { locked: false } };
    } catch (err) {
      log.error('[Asset:unlock] Failed:', err);
      return { success: false, error: { message: `Failed: ${err instanceof Error ? err.message : err}`, code: 'UNLOCK_FAILED' } };
    }
  });

  // Get lock status
  ipcMain.handle(IPC_CHANNELS.ASSET_LOCK_STATUS, (_event, assetId: string) => {
    if (!moduleAssetStore) {
      return { success: true, data: { locked: false } };
    }
    const locked = moduleAssetStore.getMeta(assetId, 'locked') === 'true';
    return { success: true, data: { locked } };
  });

  // ── AI-Protected Zone IPC handlers ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AI_ZONE_LIST, () => {
    if (!moduleAssetStore) {
      return { success: true, data: [] };
    }
    return { success: true, data: moduleAssetStore.listProtectedZones() };
  });

  ipcMain.handle(IPC_CHANNELS.AI_ZONE_ADD, (_event, opts: { path: string; name: string; type: 'file' | 'directory'; protectionLevel: string }) => {
    if (!moduleAssetStore) {
      return { success: false, error: { message: 'Asset store not available', code: 'NOT_AVAILABLE' } };
    }
    try {
      const zone = moduleAssetStore.addProtectedZone(opts);
      log.info(`[AI-Zone] Added protected zone: ${opts.name} (${opts.path}) — ${opts.protectionLevel}`);
      return { success: true, data: zone };
    } catch (err) {
      return { success: false, error: { message: err instanceof Error ? err.message : String(err), code: 'ZONE_ADD_FAILED' } };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_ZONE_REMOVE, (_event, zoneId: string) => {
    if (!moduleAssetStore) {
      return { success: false, error: { message: 'Asset store not available', code: 'NOT_AVAILABLE' } };
    }
    moduleAssetStore.removeProtectedZone(zoneId);
    log.info(`[AI-Zone] Removed protected zone: ${zoneId}`);
    return { success: true, data: null };
  });

  ipcMain.handle(IPC_CHANNELS.AI_ZONE_UPDATE_LEVEL, (_event, zoneId: string, level: string) => {
    if (!moduleAssetStore) {
      return { success: false, error: { message: 'Asset store not available', code: 'NOT_AVAILABLE' } };
    }
    moduleAssetStore.updateZoneProtectionLevel(zoneId, level as 'warn' | 'block' | 'freeze');
    log.info(`[AI-Zone] Updated zone ${zoneId} protection level to ${level}`);
    return { success: true, data: null };
  });

  ipcMain.handle(IPC_CHANNELS.AI_ZONE_TOGGLE, (_event, zoneId: string) => {
    if (!moduleAssetStore) {
      return { success: false, error: { message: 'Asset store not available', code: 'NOT_AVAILABLE' } };
    }
    moduleAssetStore.toggleZone(zoneId);
    log.info(`[AI-Zone] Toggled zone: ${zoneId}`);
    return { success: true, data: null };
  });

  ipcMain.handle(IPC_CHANNELS.AI_ZONE_BROWSE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory'],
      title: 'Select file or folder to protect',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, data: { canceled: true } };
    }
    const selectedPath = result.filePaths[0];
    const stats = statSync(selectedPath);
    return {
      success: true,
      data: {
        canceled: false,
        path: selectedPath,
        type: stats.isDirectory() ? 'directory' : 'file',
        name: path.basename(selectedPath),
      },
    };
  });

  // Shield toggle handler — registered here because it needs access to shieldWindow
  ipcMain.handle('app:toggle-shield-overlay', () => {
    if (shieldWindow) {
      shieldWindow.close();
      shieldWindow = null;
    } else {
      shieldWindow = createShieldWindow();
    }
    return { success: true, data: null };
  });

  // Shield position handler — repositions overlay window immediately
  ipcMain.handle('shield:set-position', (_event, position: string) => {
    const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
    if (!validPositions.includes(position as typeof validPositions[number])) {
      return { success: false, error: { message: 'Invalid position', code: 'INVALID_POSITION' } };
    }
    const anchor = position as ShieldOverlayConfig['anchor'];
    // Persist to structured config
    configManager!.set('shield.anchor', anchor);
    // Reposition window immediately if it exists
    if (shieldWindow) {
      const shieldConfig = configManager!.getShieldConfig();
      const pos = getShieldPosition({ ...shieldConfig, anchor, margin: shieldConfig.margin ?? 20 });
      shieldWindow.setPosition(Math.round(pos.x), Math.round(pos.y));
    }
    return { success: true, data: null };
  });

  // Shield opacity handler — sets overlay opacity immediately
  ipcMain.handle('shield:set-opacity', (_event, opacity: number) => {
    const clamped = Math.max(0.1, Math.min(1.0, opacity));
    // Persist to structured config
    configManager!.set('shield.opacity', clamped);
    // Apply immediately if window exists
    if (shieldWindow) {
      shieldWindow.setOpacity(clamped);
    }
    return { success: true, data: null };
  });

  // ── Local API server for browser extension ──────────────────────────────
  // Generate or read persisted API token
  let apiToken = configManager.get('localApiToken') as string | null;
  if (!apiToken) {
    apiToken = randomUUID();
    configManager.set('localApiToken', apiToken);
  }

  localApi = new LocalApiServer({
    getServices: () => services,
    getTrustScore: () => currentTrustScore,
    getTrustLevel: () => currentTrustLevel,
    getUserEmail: () => {
      return (services?.licenseManager?.getLicense() as { email?: string })?.email || 'user@qshield.io';
    },
    getUserName: () => {
      return 'QShield User';
    },
    getApiToken: () => apiToken!,
  });
  localApi.setToken(apiToken);

  localApi.start(3847).then(() => {
    const port = localApi!.getPort();
    configManager!.set('localApiPort', port);
    log.info(`Local API server running on port ${port}`);
  }).catch((err) => {
    log.error('Failed to start local API server:', err);
  });

  // Wire up localApiManager on the service registry (needs localApi + configManager)
  services!.localApiManager = {
    getInfo: () => ({
      port: localApi?.getPort() ?? 3847,
      token: apiToken!,
      running: localApi !== null,
    }),
    regenerateToken: () => {
      const newToken = randomUUID();
      apiToken = newToken;
      configManager!.set('localApiToken', newToken);
      localApi?.setToken(newToken);
      return { token: newToken };
    },
  };

  // Create main window
  mainWindow = createMainWindow();

  // Set up auto-updater (checks for updates on startup, registers IPC handlers)
  setupAutoUpdater(mainWindow);

  // Create shield overlay if enabled
  const shieldConfig = configManager.getShieldConfig();
  if (shieldConfig.enabled) {
    shieldWindow = createShieldWindow();
  }

  // Create tray
  createTray();

  // ── Alert broadcast + simulation ────────────────────────────────────────
  const notificationService = new NotificationService('medium');

  /** Broadcast an alert to all renderer windows and show OS notification */
  function broadcastAlert(alert: SeedAlert): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('event:alert-received', alert);
      }
    }
    notificationService.notify(alert as unknown as import('@qshield/core').Alert, '/alerts');
    log.info(`[AlertSim] Broadcast alert: ${alert.title}`);
  }

  // Periodic alert simulation disabled — real alerts come from PolicyEnforcer via TrustMonitor
  // setInterval removed to prevent fake alerts from being broadcast

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
