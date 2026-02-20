import * as chokidar from 'chokidar';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from 'electron-log';
import { safeExecFile } from './safe-exec';
import { SENSITIVITY_MULTIPLIERS } from '@qshield/core';
import type {
  HighTrustAsset,
  AssetSensitivity,
  AssetTrustState,
  AssetChangeEvent,
} from '@qshield/core';
import { AssetStore } from './asset-store';
import {
  enrichFileChange,
  captureSnapshot,
  type FileSnapshot,
} from './file-forensics';

type AssetEventCallback = (event: AssetChangeEvent, asset: HighTrustAsset) => void;

/**
 * Bridges the AssetStore with chokidar filesystem watching.
 *
 * Watches all registered high-trust asset paths, reacts to changes by
 * recomputing hashes, updating trust state, logging changes, and
 * notifying listeners (e.g. TrustMonitor for evidence creation).
 *
 * Also runs periodic hash verification on a schedule determined by
 * each asset's sensitivity level:
 *   - Critical: every 5 minutes
 *   - Strict:   every 15 minutes
 *   - Normal:   every 60 minutes
 */
/** Chokidar ignore patterns for OS/editor junk files that should never trigger alerts. */
const ASSET_IGNORED_PATTERNS = [
  // macOS system files
  '**/.DS_Store',
  '**/.Spotlight-V100',
  '**/.fseventsd',
  '**/.Trashes',
  '**/.TemporaryItems',
  '**/._*',
  '**/.localized',
  // Windows system files
  '**/Thumbs.db',
  '**/desktop.ini',
  '**/ehthumbs.db',
  // Temp/swap files
  '**/*.tmp',
  '**/*.swp',
  '**/*.swo',
  '**/*~',
  '**/~$*',
  '**/.~lock.*',
  // Version control
  '**/.git/**',
  '**/.svn/**',
  // OS caches
  '**/Library/Caches/**',
  '**/node_modules/**',
];

/** File names that should always be ignored (safety net if chokidar misses). */
const IGNORED_FILE_NAMES = new Set([
  '.DS_Store', '.ds_store',
  'Thumbs.db', 'desktop.ini', 'ehthumbs.db',
  '.localized', '.gitkeep',
]);

/** Patterns for file names that should always be ignored. */
const IGNORED_FILE_PATTERNS = [
  /^\._/,          // macOS resource forks: ._filename
  /^~\$/,          // Office temp files: ~$filename
  /\.tmp$/i,
  /\.swp$/i,
  /\.swo$/i,
  /~$/,
  /^\.~lock\./,    // LibreOffice locks
];

/** Path segments that indicate OS infrastructure, not user files. */
const IGNORED_PATH_SEGMENTS = [
  '.Spotlight-V100',
  '.fseventsd',
  '.Trashes',
  '.TemporaryItems',
];

export class AssetMonitor {
  private store: AssetStore;
  private watcher: chokidar.FSWatcher | null = null;
  private listeners: AssetEventCallback[] = [];
  private hashCache: Map<string, string> = new Map(); // path → last known hash
  private snapshots: Map<string, FileSnapshot> = new Map(); // path → last snapshot
  private verifyInterval: ReturnType<typeof setInterval> | null = null;
  private accessPollTimer: ReturnType<typeof setInterval> | null = null;
  private knownAccessors: Map<string, Set<string>> = new Map(); // assetId → Set<"processName:pid">
  private pausedAssets: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(store: AssetStore) {
    this.store = store;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Start watching all registered (enabled) assets. */
  async start(): Promise<void> {
    const assets = this.store.listAssets().filter((a) => a.enabled);
    if (assets.length === 0) {
      log.info('[AssetMonitor] No assets to monitor');
      return;
    }

    // Seed the hash cache with known hashes and capture initial snapshots
    for (const a of assets) {
      if (a.contentHash) {
        this.hashCache.set(a.path, a.contentHash);
      }
      if (a.type === 'file') {
        const snap = await captureSnapshot(a.path);
        if (snap) this.snapshots.set(a.path, snap);
      }
    }

    const paths = assets.map((a) => a.path);
    this.watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 5,
      ignored: ASSET_IGNORED_PATTERNS,
    });

    this.watcher
      .on('ready', () => log.info('[AssetMonitor] Chokidar ready — real-time watching active'))
      .on('change', (filePath) => this.handleChange(filePath, 'asset-modified'))
      .on('add', (filePath) => this.handleChange(filePath, 'asset-created'))
      .on('unlink', (filePath) => this.handleChange(filePath, 'asset-deleted'))
      .on('error', (err) => log.error('[AssetMonitor] Watch error:', err));

    // Periodic verification — check every minute, each asset's schedule
    // is determined by its sensitivity level
    this.verifyInterval = setInterval(() => this.periodicVerify(), 60_000);

    // Poll for file access (lsof) every 10 seconds (macOS only)
    if (process.platform === 'darwin') {
      this.accessPollTimer = setInterval(() => this.checkFileAccess(), 10_000);
    }

    log.info(`[AssetMonitor] Watching ${assets.length} high-trust assets`);
  }

  /** Stop watching all assets and clear intervals. */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this.verifyInterval) {
      clearInterval(this.verifyInterval);
      this.verifyInterval = null;
    }
    if (this.accessPollTimer) {
      clearInterval(this.accessPollTimer);
      this.accessPollTimer = null;
    }
    this.hashCache.clear();
    this.snapshots.clear();
    this.knownAccessors.clear();
    log.info('[AssetMonitor] Stopped');
  }

  /** Register a callback for asset change events. */
  onAssetChange(callback: AssetEventCallback): void {
    this.listeners.push(callback);
  }

  /** Pause monitoring for an asset temporarily. */
  pauseAsset(assetId: string, durationSeconds: number): void {
    const asset = this.store.getAsset(assetId);
    if (!asset) return;

    log.info(`[AssetMonitor] Pausing asset "${asset.name}" for ${durationSeconds}s`);

    // Unwatch the path
    if (this.watcher) {
      this.watcher.unwatch(asset.path);
    }

    // Clear any existing pause timer
    const existing = this.pausedAssets.get(assetId);
    if (existing) clearTimeout(existing);

    // Resume after duration
    const timer = setTimeout(() => {
      log.info(`[AssetMonitor] Resuming asset "${asset.name}"`);
      this.pausedAssets.delete(assetId);
      const current = this.store.getAsset(assetId);
      if (current && current.enabled && this.watcher) {
        this.watcher.add(current.path);
      }
    }, durationSeconds * 1000);

    this.pausedAssets.set(assetId, timer);
  }

  /** Resume monitoring for a paused asset immediately. */
  resumeAsset(assetId: string): void {
    log.info(`[AssetMonitor] Manually resuming asset ${assetId}`);

    // Clear the pause timer
    const timer = this.pausedAssets.get(assetId);
    if (timer) {
      clearTimeout(timer);
      this.pausedAssets.delete(assetId);
    }

    // Restart watching
    const asset = this.store.getAsset(assetId);
    if (asset && asset.enabled && this.watcher) {
      this.watcher.add(asset.path);
    }
  }

  // -----------------------------------------------------------------------
  // Asset management (wraps store + watcher updates)
  // -----------------------------------------------------------------------

  /** Add a new asset and start watching it immediately. */
  async addAsset(
    assetPath: string,
    type: 'file' | 'directory',
    sensitivity: AssetSensitivity,
    name?: string,
  ): Promise<HighTrustAsset> {
    const asset = this.store.addAsset(assetPath, type, sensitivity, name);

    // Add to live watcher if running
    if (this.watcher) {
      this.watcher.add(asset.path);
    }

    // Cache initial hash and snapshot
    if (asset.contentHash) {
      this.hashCache.set(asset.path, asset.contentHash);
    }
    if (asset.type === 'file') {
      const snap = await captureSnapshot(asset.path);
      if (snap) this.snapshots.set(asset.path, snap);
    }

    return asset;
  }

  /** Remove an asset and stop watching it. */
  async removeAsset(id: string): Promise<void> {
    const asset = this.store.getAsset(id);
    if (asset) {
      if (this.watcher) {
        this.watcher.unwatch(asset.path);
      }
      this.hashCache.delete(asset.path);
      this.snapshots.delete(asset.path);
      this.store.removeAsset(id);
      log.info(`[AssetMonitor] Removed asset: ${asset.name}`);
    }
  }

  /**
   * Manually re-verify an asset: recompute hash and compare against
   * the last verified hash.
   */
  async verifyAsset(id: string): Promise<HighTrustAsset | null> {
    const asset = this.store.getAsset(id);
    if (!asset) return null;

    try {
      const currentHash = await this.computeHash(asset.path, asset.type);
      this.store.updateHash(id, currentHash);
      this.hashCache.set(asset.path, currentHash);

      // Never verified by user — just update the content hash, keep unverified
      if (!asset.verifiedHash) {
        return this.store.getAsset(id);
      }

      // Update snapshot after verification
      if (asset.type === 'file') {
        const snap = await captureSnapshot(asset.path);
        if (snap) this.snapshots.set(asset.path, snap);
      }

      if (currentHash === asset.verifiedHash) {
        // Check for mtime-only change (file touched but content unchanged)
        try {
          const stat = await fs.promises.stat(asset.path);
          const currentMtime = String(stat.mtimeMs);
          const lastMtime = this.store.getMeta(id, 'lastMtime');
          if (lastMtime && currentMtime !== lastMtime) {
            const touchImpact = asset.sensitivity === 'critical' ? -5 : -2;
            const touchEvent: AssetChangeEvent = {
              assetId: asset.id,
              path: asset.path,
              sensitivity: asset.sensitivity,
              eventType: 'asset-touched',
              previousHash: currentHash,
              newHash: currentHash,
              trustStateBefore: asset.trustState,
              trustStateAfter: asset.trustState,
              timestamp: new Date().toISOString(),
              metadata: {
                fileName: path.basename(asset.path),
                isHighTrustAsset: true,
                detectedBy: 'periodic-verify',
                previousMtime: lastMtime,
                currentMtime,
                trustImpact: touchImpact,
              },
            };
            this.store.logChange(asset.id, touchEvent);
            this.notifyListeners(touchEvent, asset);
            log.info(`[AssetMonitor] Mtime changed but hash identical: ${asset.name}`);
          }
          this.store.setMeta(id, 'lastMtime', currentMtime);
        } catch {
          /* stat failed — skip mtime check */
        }
        return this.store.verifyAsset(id);
      } else {
        // Hash mismatch — run through the full change pipeline
        this.store.markChanged(id, currentHash);

        const impact = this.computeTrustImpact(asset.sensitivity, 'asset-modified');
        const newScore = Math.max(0, asset.trustScore + impact);
        this.store.updateTrustScore(id, newScore);

        // For directories, find which files recently changed
        let recentlyChanged: string[] = [];
        if (asset.type === 'directory') {
          recentlyChanged = await this.findRecentlyChangedFiles(asset.path);
        }

        // Run forensics on the first changed file (or the asset path itself)
        const forensicsTarget = recentlyChanged.length > 0 ? recentlyChanged[0] : asset.path;
        const previousSnapshot = this.snapshots.get(forensicsTarget);
        let forensics;
        try {
          forensics = await enrichFileChange(forensicsTarget, 'asset-modified', previousSnapshot);
        } catch (err) {
          log.warn(`[AssetMonitor] Forensics enrichment failed for ${asset.name}:`, err);
        }

        const changedFileName = recentlyChanged.length > 0
          ? path.basename(recentlyChanged[0])
          : path.basename(asset.path);
        const changedFileNames = recentlyChanged.map((f) => path.basename(f)).slice(0, 10);

        const changeEvent: AssetChangeEvent = {
          assetId: asset.id,
          path: recentlyChanged.length > 0 ? recentlyChanged[0] : asset.path,
          sensitivity: asset.sensitivity,
          eventType: 'asset-modified',
          previousHash: asset.contentHash,
          newHash: currentHash,
          trustStateBefore: asset.trustState,
          trustStateAfter: 'changed',
          timestamp: new Date().toISOString(),
          metadata: {
            fileName: changedFileName,
            relativePath: recentlyChanged.length > 0
              ? path.relative(asset.path, recentlyChanged[0])
              : '',
            isHighTrustAsset: true,
            changedFile: recentlyChanged.length > 0 ? recentlyChanged[0] : asset.path,
            changedFileName,
            ...(asset.type === 'directory' ? { directoryName: path.basename(asset.path) } : {}),
            detectedBy: 'periodic-verify',
            changedFileCount: recentlyChanged.length,
            changedFileNames,
            ...(forensics ? { forensics } : {}),
          },
        };

        this.store.logChange(asset.id, changeEvent);

        log.info(
          `[AssetMonitor] Periodic verify detected change: ${asset.name} [${asset.sensitivity}] ${asset.trustState} → changed`,
        );

        // Notify listeners (TrustMonitor + renderer IPC)
        const updatedAsset = this.store.getAsset(id)!;
        for (const listener of this.listeners) {
          try {
            listener(changeEvent, updatedAsset);
          } catch (err) {
            log.error('[AssetMonitor] Listener error:', err);
          }
        }

        return updatedAsset;
      }
    } catch (err) {
      log.warn(`[AssetMonitor] Hash computation failed for ${asset.name}:`, err);
      return asset;
    }
  }

  /**
   * Accept the current state of an asset as verified.
   * The current content hash becomes the new verified hash.
   */
  async acceptChanges(id: string): Promise<HighTrustAsset | null> {
    const asset = this.store.getAsset(id);
    if (!asset) return null;
    return this.store.verifyAsset(id);
  }

  // -----------------------------------------------------------------------
  // Change handling
  // -----------------------------------------------------------------------

  /** Check whether a file path is OS/editor junk that should be silently ignored. */
  private shouldIgnoreFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    if (IGNORED_FILE_NAMES.has(fileName)) return true;
    if (IGNORED_FILE_PATTERNS.some((p) => p.test(fileName))) return true;
    if (IGNORED_PATH_SEGMENTS.some((seg) => filePath.includes(seg))) return true;
    return false;
  }

  private async handleChange(
    filePath: string,
    eventType: AssetChangeEvent['eventType'],
  ): Promise<void> {
    // Skip OS/editor junk files (safety net — chokidar ignored should catch most)
    if (this.shouldIgnoreFile(filePath)) return;

    // Find which registered asset this file belongs to
    const asset = this.findAssetForPath(filePath);
    if (!asset || !asset.enabled) return;

    // Skip paused assets
    if (this.pausedAssets.has(asset.id)) return;

    const previousHash = this.hashCache.get(filePath) ?? asset.contentHash;
    let newHash: string | null = null;

    if (eventType !== 'asset-deleted') {
      try {
        newHash = await this.hashFile(filePath);
        this.hashCache.set(filePath, newHash);
      } catch (err) {
        log.warn(`[AssetMonitor] Could not hash ${filePath}:`, err);
      }
    } else {
      this.hashCache.delete(filePath);
    }

    // Determine new trust state
    const trustStateBefore = asset.trustState;
    let trustStateAfter: AssetTrustState = asset.trustState;

    if (eventType === 'asset-deleted') {
      trustStateAfter = 'changed';
    } else if (newHash && asset.verifiedHash && newHash !== asset.verifiedHash) {
      // Only mark 'changed' if there's a user-verified baseline to compare against
      trustStateAfter = 'changed';
    }

    // Update store if state changed
    if (trustStateAfter === 'changed') {
      this.store.markChanged(asset.id, newHash ?? '');

      // Compute trust impact based on sensitivity
      const impact = this.computeTrustImpact(asset.sensitivity, eventType);
      const newScore = Math.max(0, asset.trustScore + impact);
      this.store.updateTrustScore(asset.id, newScore);
    }

    // Gather forensic metadata (non-blocking, with timeouts)
    const previousSnapshot = this.snapshots.get(filePath);
    let forensics;
    try {
      forensics = await enrichFileChange(filePath, eventType, previousSnapshot);
    } catch (err) {
      log.warn(`[AssetMonitor] Forensics enrichment failed for ${filePath}:`, err);
    }

    // Update snapshot after change
    if (eventType !== 'asset-deleted') {
      const snap = await captureSnapshot(filePath);
      if (snap) this.snapshots.set(filePath, snap);
    } else {
      this.snapshots.delete(filePath);
    }

    // Build the change event
    const isDirectory = asset.type === 'directory';
    const changedFileName = path.basename(filePath);
    const relativePath = isDirectory ? path.relative(asset.path, filePath) : '';

    const changeEvent: AssetChangeEvent = {
      assetId: asset.id,
      path: filePath,
      sensitivity: asset.sensitivity,
      eventType,
      previousHash,
      newHash,
      trustStateBefore,
      trustStateAfter,
      timestamp: new Date().toISOString(),
      metadata: {
        fileName: changedFileName,
        relativePath,
        isHighTrustAsset: true,
        changedFile: filePath,
        changedFileName,
        ...(isDirectory ? { directoryName: path.basename(asset.path) } : {}),
        detectedBy: 'real-time',
        ...(forensics ? { forensics } : {}),
      },
    };

    // Log to the change log table
    this.store.logChange(asset.id, changeEvent);

    log.info(
      `[AssetMonitor] ${eventType}: ${path.basename(filePath)} [${asset.sensitivity}] ${trustStateBefore} → ${trustStateAfter}`,
    );

    // Notify listeners (TrustMonitor will create evidence + trust signals)
    const updatedAsset = this.store.getAsset(asset.id)!;
    for (const listener of this.listeners) {
      try {
        listener(changeEvent, updatedAsset);
      } catch (err) {
        log.error('[AssetMonitor] Listener error:', err);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Trust impact
  // -----------------------------------------------------------------------

  private computeTrustImpact(
    sensitivity: AssetSensitivity,
    eventType: string,
  ): number {
    const baseImpact: Record<string, number> = {
      'asset-created': -5,
      'asset-modified': -15,
      'asset-deleted': -30,
      'asset-renamed': -10,
      'asset-permission-changed': -20,
      'asset-accessed': -3,
      'asset-touched': -2,
    };
    const multiplier = SENSITIVITY_MULTIPLIERS[sensitivity];
    return Math.round((baseImpact[eventType] ?? -10) * multiplier);
  }

  // -----------------------------------------------------------------------
  // Path resolution
  // -----------------------------------------------------------------------

  /**
   * Find the registered asset that a file path belongs to.
   * A file can either BE the asset itself, or be inside an asset directory.
   */
  private findAssetForPath(filePath: string): HighTrustAsset | null {
    // Exact match first
    const exact = this.store.getAssetByPath(filePath);
    if (exact) return exact;

    // Check if file is inside any registered directory asset
    const assets = this.store.listAssets();
    for (const a of assets) {
      if (a.type === 'directory' && filePath.startsWith(a.path + path.sep)) {
        return a;
      }
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Hashing
  // -----------------------------------------------------------------------

  private async computeHash(
    targetPath: string,
    type: 'file' | 'directory',
  ): Promise<string> {
    if (type === 'file') return this.hashFileWithTimeout(targetPath);
    return this.hashDirectory(targetPath);
  }

  /** Hash a file with a 10-second timeout (cloud storage files can block). */
  private hashFileWithTimeout(filePath: string, timeoutMs = 10_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          stream.destroy();
          reject(new Error(`Hash timeout after ${timeoutMs}ms: ${filePath}`));
        }
      }, timeoutMs);

      stream.on('data', (chunk: Buffer) => hash.update(chunk));
      stream.on('end', () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve(hash.digest('hex'));
        }
      });
      stream.on('error', (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  private hashFile(filePath: string): Promise<string> {
    return this.hashFileWithTimeout(filePath);
  }

  /**
   * Compute a merkle-style hash for a directory.
   * Limits to 500 files max and 30-second total timeout to prevent
   * hanging on large directories or cloud storage.
   */
  private async hashDirectory(dirPath: string): Promise<string> {
    const MAX_FILES = 500;
    const TOTAL_TIMEOUT_MS = 30_000;
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;

    const files = await this.walkDir(dirPath);
    const sorted = files.sort().slice(0, MAX_FILES);

    if (files.length > MAX_FILES) {
      log.warn(`[AssetMonitor] Directory ${dirPath} has ${files.length} files, sampling first ${MAX_FILES}`);
    }

    const hashes: string[] = [];
    for (const file of sorted) {
      if (Date.now() > deadline) {
        log.warn(`[AssetMonitor] Directory hash timeout after ${TOTAL_TIMEOUT_MS}ms: ${dirPath} (hashed ${hashes.length}/${sorted.length})`);
        break;
      }
      try {
        const h = await this.hashFileWithTimeout(file, 5_000);
        hashes.push(h);
      } catch {
        /* skip unreadable/slow files */
      }
    }
    const merkle = crypto.createHash('sha256');
    for (const h of hashes) {
      merkle.update(h);
    }
    return merkle.digest('hex');
  }

  private async walkDir(dirPath: string): Promise<string[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }
    const files: string[] = [];
    for (const entry of entries) {
      // Skip OS/editor junk files in directory hashing
      if (IGNORED_FILE_NAMES.has(entry.name)) continue;
      if (IGNORED_FILE_PATTERNS.some((p) => p.test(entry.name))) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        if (IGNORED_PATH_SEGMENTS.includes(entry.name)) continue;
        files.push(...(await this.walkDir(full)));
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
    return files;
  }

  // -----------------------------------------------------------------------
  // Directory change detection
  // -----------------------------------------------------------------------

  /**
   * Scan a directory for files modified within the last 5 minutes.
   * Used by periodic verify to identify which specific files changed.
   */
  private async findRecentlyChangedFiles(dirPath: string): Promise<string[]> {
    const fiveMinAgo = Date.now() - 300_000;
    const changed: string[] = [];
    const MAX_DEPTH = 3;

    const scan = async (dir: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH) return;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (IGNORED_FILE_NAMES.has(entry.name)) continue;
        if (IGNORED_FILE_PATTERNS.some((p) => p.test(entry.name))) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          if (IGNORED_PATH_SEGMENTS.includes(entry.name)) continue;
          await scan(full, depth + 1);
        } else if (entry.isFile()) {
          try {
            const s = await fs.promises.stat(full);
            if (s.mtimeMs > fiveMinAgo) {
              changed.push(full);
            }
          } catch { /* skip unreadable */ }
        }
      }
    };

    await scan(dirPath, 0);
    // Sort most-recently-modified first
    return changed.sort((a, b) => b.localeCompare(a)).slice(0, 20);
  }

  // -----------------------------------------------------------------------
  // File access monitoring (lsof-based)
  // -----------------------------------------------------------------------

  /** Notify all registered listeners of an asset change event. */
  private notifyListeners(event: AssetChangeEvent, asset: HighTrustAsset): void {
    for (const listener of this.listeners) {
      try {
        listener(event, asset);
      } catch (err) {
        log.error('[AssetMonitor] Listener error:', err);
      }
    }
  }

  /** Poll lsof for processes that have high-trust asset files open. */
  private async checkFileAccess(): Promise<void> {
    const assets = this.store.listAssets().filter((a) => a.enabled && a.type === 'file');
    if (assets.length === 0) return;

    // System processes to ignore — these are macOS infrastructure, not user activity
    const IGNORED_PROCESSES = new Set([
      'mds', 'mds_stores', 'mdworker', 'mdworker_shared',
      'Spotlight', 'fseventsd', 'fseventssd',
      'bird', 'cloudd', 'nsurlsessiond', // iCloud
      'kernel_task', 'launchd', 'diskarbitrationd',
      'revisiond', 'filecoordinationd',
      'Finder', 'finder',               // Finder directory indexing / .DS_Store writes
    ]);

    for (const asset of assets) {
      if (this.pausedAssets.has(asset.id)) continue;

      try {
        const accessors = await this.runLsof(asset.path);
        if (accessors.length === 0) continue;

        // Initialize known set if first poll
        if (!this.knownAccessors.has(asset.id)) {
          const initial = new Set(accessors.map((a) => `${a.processName}:${a.pid}`));
          this.knownAccessors.set(asset.id, initial);
          continue; // Don't alert on first poll — these were already open
        }

        const known = this.knownAccessors.get(asset.id)!;
        const newAccessors = accessors.filter((a) => {
          const key = `${a.processName}:${a.pid}`;
          return !known.has(key) && !IGNORED_PROCESSES.has(a.processName);
        });

        // Update known set
        const updated = new Set(accessors.map((a) => `${a.processName}:${a.pid}`));
        this.knownAccessors.set(asset.id, updated);

        if (newAccessors.length === 0) continue;

        // Emit an access event for meaningful new accessors
        const impact =
          asset.sensitivity === 'critical' ? -10
          : asset.sensitivity === 'strict' ? -5
          : -2;

        const accessEvent: AssetChangeEvent = {
          assetId: asset.id,
          path: asset.path,
          sensitivity: asset.sensitivity,
          eventType: 'asset-accessed',
          previousHash: asset.contentHash,
          newHash: asset.contentHash,
          trustStateBefore: asset.trustState,
          trustStateAfter: asset.trustState,
          timestamp: new Date().toISOString(),
          metadata: {
            fileName: path.basename(asset.path),
            isHighTrustAsset: true,
            detectedBy: 'access-poll',
            accessors: newAccessors.map((a) => ({
              process: this.friendlyProcessName(a.processName),
              pid: a.pid,
              user: a.user,
              accessType: a.accessType,
            })),
            accessorNames: newAccessors.map((a) => this.friendlyProcessName(a.processName)),
            trustImpact: impact,
          },
        };

        this.store.logChange(asset.id, accessEvent);
        this.notifyListeners(accessEvent, asset);

        log.info(
          `[AssetMonitor] File access detected: ${asset.name} opened by ${newAccessors.map((a) => a.processName).join(', ')}`,
        );
      } catch (err) {
        log.debug(`[AssetMonitor] lsof check failed for ${asset.name}:`, err);
      }
    }
  }

  /** Run lsof on a file path and parse the output. */
  private async runLsof(filePath: string): Promise<Array<{ processName: string; pid: string; user: string; accessType: string; filePath: string }>> {
    try {
      const stdout = await safeExecFile('lsof', ['-F', 'pcufa', '--', filePath], { timeout: 5_000 });
      if (!stdout.trim()) {
        return [];
      }
      const results: Array<{ processName: string; pid: string; user: string; accessType: string; filePath: string }> = [];
      let current: { processName: string; pid: string; user: string; accessType: string; filePath: string } = {
        processName: '', pid: '', user: '', accessType: '', filePath: '',
      };

      for (const line of stdout.split('\n')) {
        if (!line) continue;
        const tag = line[0];
        const value = line.slice(1);
        switch (tag) {
          case 'p':
            // New process — push previous if complete
            if (current.pid && current.processName) {
              results.push({ ...current });
            }
            current = { processName: '', pid: value, user: '', accessType: '', filePath: '' };
            break;
          case 'c':
            current.processName = value;
            break;
          case 'u':
            current.user = value;
            break;
          case 'a':
            current.accessType = value; // 'r', 'w', 'u' (read, write, read-write)
            break;
          case 'f':
            // File descriptor — ignore (we have the path)
            break;
          case 'n':
            current.filePath = value;
            break;
        }
      }
      // Push last entry
      if (current.pid && current.processName) {
        results.push(current);
      }

      // Filter out our own app
      const appName = 'QShield';
      return results.filter((r) => !r.processName.includes(appName) && r.processName !== 'Electron');
    } catch {
      return [];
    }
  }

  /** Convert raw process names to human-readable app names. */
  private friendlyProcessName(rawName: string): string {
    // macOS apps often show as "AppName" already, but some have suffixes
    const map: Record<string, string> = {
      'com.apple.TextEdit': 'TextEdit',
      'com.apple.Preview': 'Preview',
      'com.apple.finder': 'Finder',
      'com.microsoft.VSCode': 'VS Code',
      'code': 'VS Code',
      'Code Helper': 'VS Code',
      'vim': 'Vim',
      'nvim': 'Neovim',
      'nano': 'Nano',
      'less': 'Less',
      'cat': 'cat',
      'tail': 'tail',
      'Python': 'Python',
      'python3': 'Python',
      'node': 'Node.js',
    };
    return map[rawName] ?? rawName;
  }

  // -----------------------------------------------------------------------
  // Periodic verification
  // -----------------------------------------------------------------------

  /**
   * Check asset hashes on a schedule determined by sensitivity:
   *   - Critical: every 5 minutes
   *   - Strict:   every 15 minutes
   *   - Normal:   every 60 minutes
   *
   * Called once per minute; only verifies assets whose interval has elapsed.
   */
  private async periodicVerify(): Promise<void> {
    const now = Date.now();
    const assets = this.store.listAssets().filter((a) => a.enabled);
    let checked = 0;

    for (const asset of assets) {
      // Skip assets never verified by user — no baseline to compare against
      if (!asset.verifiedHash) continue;

      const lastCheck = asset.lastVerified
        ? new Date(asset.lastVerified).getTime()
        : 0;

      const interval =
        asset.sensitivity === 'critical'
          ? 300_000 // 5 min
          : asset.sensitivity === 'strict'
            ? 900_000 // 15 min
            : 3_600_000; // 60 min

      if (now - lastCheck >= interval) {
        try {
          await this.verifyAsset(asset.id);
          checked++;
        } catch (err) {
          log.warn(`[AssetMonitor] Periodic verify failed for ${asset.name}:`, err);
        }
      }
    }

    log.info(`[AssetMonitor] Periodic verify: checked ${checked}/${assets.length} assets (skipped ${assets.length - checked} not due)`);
  }
}
