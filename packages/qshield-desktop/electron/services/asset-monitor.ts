import * as chokidar from 'chokidar';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from 'electron-log';
import { SENSITIVITY_MULTIPLIERS } from '@qshield/core';
import type {
  HighTrustAsset,
  AssetSensitivity,
  AssetTrustState,
  AssetChangeEvent,
} from '@qshield/core';
import { AssetStore } from './asset-store';

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
export class AssetMonitor {
  private store: AssetStore;
  private watcher: chokidar.FSWatcher | null = null;
  private listeners: AssetEventCallback[] = [];
  private hashCache: Map<string, string> = new Map(); // path → last known hash
  private verifyInterval: ReturnType<typeof setInterval> | null = null;

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

    // Seed the hash cache with known hashes
    for (const a of assets) {
      if (a.contentHash) {
        this.hashCache.set(a.path, a.contentHash);
      }
    }

    const paths = assets.map((a) => a.path);
    this.watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 2,
      usePolling: true,
      interval: 5000,
    });

    this.watcher
      .on('change', (filePath) => this.handleChange(filePath, 'asset-modified'))
      .on('add', (filePath) => this.handleChange(filePath, 'asset-created'))
      .on('unlink', (filePath) => this.handleChange(filePath, 'asset-deleted'))
      .on('error', (err) => log.error('[AssetMonitor] Watch error:', err));

    // Periodic verification — check every minute, each asset's schedule
    // is determined by its sensitivity level
    this.verifyInterval = setInterval(() => this.periodicVerify(), 60_000);

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
    this.hashCache.clear();
    log.info('[AssetMonitor] Stopped');
  }

  /** Register a callback for asset change events. */
  onAssetChange(callback: AssetEventCallback): void {
    this.listeners.push(callback);
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

    // Cache initial hash
    if (asset.contentHash) {
      this.hashCache.set(asset.path, asset.contentHash);
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

      if (currentHash === asset.verifiedHash) {
        return this.store.verifyAsset(id);
      } else {
        this.store.markChanged(id, currentHash);
        return this.store.getAsset(id);
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

  private async handleChange(
    filePath: string,
    eventType: AssetChangeEvent['eventType'],
  ): Promise<void> {
    // Find which registered asset this file belongs to
    const asset = this.findAssetForPath(filePath);
    if (!asset || !asset.enabled) return;

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
    } else if (newHash && newHash !== asset.verifiedHash) {
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

    // Build the change event
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
        fileName: path.basename(filePath),
        relativePath: path.relative(asset.path, filePath),
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
    if (type === 'file') return this.hashFile(targetPath);
    return this.hashDirectory(targetPath);
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

  private async hashDirectory(dirPath: string): Promise<string> {
    const files = await this.walkDir(dirPath);
    const hashes: string[] = [];
    for (const file of files.sort()) {
      try {
        const h = await this.hashFile(file);
        hashes.push(h);
      } catch {
        /* skip unreadable files */
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
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        files.push(...(await this.walkDir(full)));
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
    return files;
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

    for (const asset of assets) {
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
        } catch (err) {
          log.warn(`[AssetMonitor] Periodic verify failed for ${asset.name}:`, err);
        }
      }
    }
  }
}
