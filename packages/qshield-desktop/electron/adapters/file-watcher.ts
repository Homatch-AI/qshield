import log from 'electron-log';
import * as chokidar from 'chokidar';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { app } from 'electron';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface FileWatcherConfig {
  /** Directories to watch. Defaults to [home/Documents, home/Downloads, home/Desktop] */
  watchPaths?: string[];
  /** Glob patterns to ignore. Defaults to node_modules, .git, OS junk files */
  ignoredPatterns?: string[];
  /** File size threshold (bytes) to flag as "large file". Default: 50MB */
  largeFileThreshold?: number;
  /** Whether to compute SHA-256 hashes of changed files. Default: true */
  computeHashes?: boolean;
  /** Max file size to hash (skip huge files). Default: 100MB */
  maxHashSize?: number;
}

const DEFAULT_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.tmp',
  '**/*.swp',
  '**/~$*',
  '**/.Trash/**',
  '**/Library/Caches/**',
];

const FIFTY_MB = 50 * 1024 * 1024;
const HUNDRED_MB = 100 * 1024 * 1024;

/**
 * Real filesystem monitoring adapter using chokidar.
 * Watches Documents, Downloads, and Desktop for file system changes
 * and emits trust-scored AdapterEvents into the TrustMonitor pipeline.
 */
export class FileWatcherAdapter extends BaseAdapter {
  readonly id: AdapterType = 'file';
  readonly name = 'File Watcher';
  protected override defaultInterval = 10000;

  private watcher: chokidar.FSWatcher | null = null;
  private watchPaths: string[] = [];
  private ignoredPatterns: (string | RegExp)[] = [];
  private largeFileThreshold = FIFTY_MB;
  private shouldComputeHashes = true;
  private maxHashSize = HUNDRED_MB;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    const fc = config as Partial<FileWatcherConfig>;

    const homedir = app.getPath('home');
    this.watchPaths = fc.watchPaths ?? [
      path.join(homedir, 'Documents'),
      path.join(homedir, 'Downloads'),
      path.join(homedir, 'Desktop'),
    ];
    this.ignoredPatterns = fc.ignoredPatterns ?? DEFAULT_IGNORED;
    this.largeFileThreshold = fc.largeFileThreshold ?? FIFTY_MB;
    this.shouldComputeHashes = fc.computeHashes ?? true;
    this.maxHashSize = fc.maxHashSize ?? HUNDRED_MB;

    log.info('[FileWatcher] Configured for real filesystem monitoring', {
      paths: this.watchPaths,
    });
  }

  /**
   * Start real filesystem monitoring via chokidar.
   * Does NOT call super.start() — bypasses the simulation timer entirely.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn('[FileWatcher] Cannot start: adapter not initialized');
      return;
    }
    this.connected = true;
    this.setupWatcher();
    log.info('[FileWatcher] Real filesystem monitoring started');
  }

  async stop(): Promise<void> {
    await this.closeWatcher();
    await super.stop();
    log.info('[FileWatcher] Stopped filesystem monitoring');
  }

  async destroy(): Promise<void> {
    await this.closeWatcher();
    await super.destroy();
    log.info('[FileWatcher] Adapter destroyed');
  }

  /**
   * Required by BaseAdapter but never called — real events come from chokidar.
   */
  protected generateSimulatedEvent(): AdapterEvent {
    throw new Error('FileWatcherAdapter uses real events, not simulation');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private setupWatcher(): void {
    // Filter to only paths that actually exist
    const existingPaths = this.watchPaths.filter((p) => {
      try {
        fs.accessSync(p, fs.constants.R_OK);
        return true;
      } catch {
        log.warn(`[FileWatcher] Skipping non-existent/unreadable path: ${p}`);
        return false;
      }
    });

    if (existingPaths.length === 0) {
      log.warn('[FileWatcher] No valid watch paths — adapter idle');
      return;
    }

    this.watcher = chokidar.watch(existingPaths, {
      ignored: this.ignoredPatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      depth: 5,
    });

    this.watcher
      .on('add', (filePath) => this.handleFileEvent('file-created', filePath))
      .on('change', (filePath) => this.handleFileEvent('file-modified', filePath))
      .on('unlink', (filePath) => this.handleFileEvent('file-deleted', filePath))
      .on('addDir', (dirPath) => this.handleFileEvent('dir-created', dirPath))
      .on('unlinkDir', (dirPath) => this.handleFileEvent('dir-deleted', dirPath))
      .on('error', (error) => {
        this.errorCount++;
        this.lastError = error.message;
        log.error('[FileWatcher] Watcher error:', error);
      });
  }

  private async closeWatcher(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleFileEvent(eventType: string, filePath: string): Promise<void> {
    if (!this.connected) return;
    try {
      const isDeleted = eventType.includes('deleted');
      const stats = isDeleted ? null : await this.safeStats(filePath);
      const homedir = app.getPath('home');
      const relativePath = path.relative(homedir, filePath);
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);

      const trustImpact = this.computeTrustImpact(eventType, filePath, stats);

      let sha256: string | undefined;
      if (
        this.shouldComputeHashes &&
        stats &&
        stats.isFile() &&
        stats.size <= this.maxHashSize
      ) {
        sha256 = await this.hashFile(filePath);
      }

      const event: AdapterEvent = {
        adapterId: this.id,
        eventType,
        timestamp: new Date().toISOString(),
        data: {
          path: relativePath,
          fullPath: filePath,
          fileName,
          extension: ext,
          size: stats?.size ?? null,
          isDirectory: stats?.isDirectory() ?? eventType.includes('dir'),
          sha256,
          permissions: stats ? (stats.mode & 0o777).toString(8) : null,
          isHidden: fileName.startsWith('.'),
          watchedDir: this.getWatchedParent(filePath),
        },
        trustImpact,
      };

      this.emitEvent(event);
    } catch (err) {
      log.warn(`[FileWatcher] Error handling ${eventType} for ${filePath}:`, err);
    }
  }

  private computeTrustImpact(
    eventType: string,
    filePath: string,
    stats: fs.Stats | null,
  ): number {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const inDownloads =
      filePath.includes('/Downloads/') || filePath.includes('\\Downloads\\');

    const sensitiveExts = new Set([
      '.env', '.pem', '.key', '.p12', '.pfx', '.kdbx', '.keychain',
    ]);
    const executableExts = new Set([
      '.exe', '.dmg', '.msi', '.app', '.sh', '.bat', '.cmd', '.ps1',
    ]);
    const archiveExts = new Set(['.zip', '.tar', '.gz', '.7z', '.rar']);

    // Base impact by event type
    let impact = 0;
    switch (eventType) {
      case 'file-created':
        impact = 0;
        break;
      case 'file-modified':
        impact = -3;
        break;
      case 'file-deleted':
        impact = -8;
        break;
      case 'dir-created':
        impact = 0;
        break;
      case 'dir-deleted':
        impact = -5;
        break;
    }

    // Modifiers
    if (sensitiveExts.has(ext)) impact -= 20;
    if (executableExts.has(ext) && inDownloads) impact -= 15;
    if (archiveExts.has(ext) && inDownloads) impact -= 10;
    if (fileName === '.env' || fileName === '.gitignore') impact -= 10;
    if (stats && stats.size > this.largeFileThreshold) impact -= 25;

    return Math.max(-100, Math.min(100, impact));
  }

  private hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: Buffer) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async safeStats(filePath: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(filePath);
    } catch {
      return null;
    }
  }

  /** Find which configured watch directory contains this path. */
  private getWatchedParent(filePath: string): string | null {
    for (const wp of this.watchPaths) {
      if (filePath.startsWith(wp)) return wp;
    }
    return null;
  }
}
