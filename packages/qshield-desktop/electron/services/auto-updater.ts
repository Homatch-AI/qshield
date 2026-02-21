import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS, IPC_EVENTS } from '../ipc/channels';

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
}

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log;

  // Don't auto-download — let user decide
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Events → push to renderer
  autoUpdater.on('checking-for-update', () => {
    log.info('[AutoUpdater] Checking for updates...');
    mainWindow.webContents.send(IPC_EVENTS.UPDATE_CHECKING);
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[AutoUpdater] Update available:', info.version);
    mainWindow.webContents.send(IPC_EVENTS.UPDATE_AVAILABLE, {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('[AutoUpdater] No updates available');
    mainWindow.webContents.send(IPC_EVENTS.UPDATE_NOT_AVAILABLE);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send(IPC_EVENTS.UPDATE_PROGRESS, {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[AutoUpdater] Update downloaded:', info.version);
    mainWindow.webContents.send(IPC_EVENTS.UPDATE_DOWNLOADED, { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('[AutoUpdater] Error:', err);
    mainWindow.webContents.send(IPC_EVENTS.UPDATE_ERROR, { message: err.message });
  });

  // IPC handlers
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true, data: null };
    } catch (err) {
      log.debug('[AutoUpdater] Check failed:', (err as Error).message);
      return { success: true, data: null };
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true, data: null };
    } catch (err) {
      return {
        success: false,
        error: { message: (err as Error).message, code: 'UPDATE_DOWNLOAD_FAILED' },
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall();
    return { success: true, data: null };
  });

  // Check for updates on startup (after 10 second delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.debug('[AutoUpdater] Initial check failed (expected if no releases):', (err as Error).message);
    });
  }, 10_000);
}
