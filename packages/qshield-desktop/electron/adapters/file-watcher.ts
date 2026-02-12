import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface FileEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const FILE_PATHS = {
  documents: [
    '/Documents/reports/quarterly-review.docx',
    '/Documents/sensitive-data.csv',
    '/Documents/hr-records.xlsx',
    '/Documents/credentials-vault.kdbx',
  ],
  downloads: [
    '/Downloads/installer.dmg',
    '/Downloads/archive.zip',
    '/Downloads/unknown-binary.exe',
    '/Downloads/presentation.pptx',
  ],
  system: [
    '/etc/hosts',
    '/.ssh/known_hosts',
    '/.ssh/id_rsa',
    '/Library/Preferences/com.app.plist',
    '/Library/Keychains/login.keychain-db',
  ],
  project: [
    '/Projects/src/main.ts',
    '/Projects/config.json',
    '/Projects/.env',
    '/Projects/package.json',
  ],
  temp: [
    '/tmp/upload-cache-001.dat',
    '/tmp/session-cache.dat',
    '/var/tmp/swap-data.bin',
  ],
};

const PROCESS_NAMES = ['Finder', 'Terminal', 'node', 'python3', 'docker', 'VS Code', 'Chrome', 'unknown'];
const PERMISSIONS = ['644', '755', '600', '777', '400', '700'];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickRandomPath(): string {
  const allPaths = Object.values(FILE_PATHS).flat();
  return pickRandom(allPaths);
}

/** Generate a realistic-looking SHA-256 hash string */
function generateSha256(): string {
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

const FILE_EVENTS: FileEventTemplate[] = [
  {
    eventType: 'file-created',
    trustImpact: 0,
    dataGenerator: () => ({
      path: pickRandomPath(),
      size: Math.floor(Math.random() * 10000000),
      sha256: generateSha256(),
      owner: 'current-user',
      permissions: pickRandom(PERMISSIONS),
      processName: pickRandom(PROCESS_NAMES),
      isInMonitoredDir: Math.random() > 0.3,
    }),
  },
  {
    eventType: 'file-modified',
    trustImpact: -5,
    dataGenerator: () => ({
      path: pickRandomPath(),
      previousSize: Math.floor(Math.random() * 5000000),
      newSize: Math.floor(Math.random() * 5000000),
      sha256Before: generateSha256(),
      sha256After: generateSha256(),
      modifiedBy: pickRandom(['current-user', 'system', 'unknown-process']),
      processName: pickRandom(PROCESS_NAMES),
      isSystemFile: Math.random() > 0.6,
    }),
  },
  {
    eventType: 'file-deleted',
    trustImpact: -10,
    dataGenerator: () => ({
      path: pickRandomPath(),
      size: Math.floor(Math.random() * 20000000),
      sha256: generateSha256(),
      deletedBy: pickRandom(['current-user', 'scheduled-task', 'unknown']),
      processName: pickRandom(PROCESS_NAMES),
      recoverable: Math.random() > 0.4,
      isInTrash: Math.random() > 0.5,
    }),
  },
  {
    eventType: 'file-moved',
    trustImpact: -3,
    dataGenerator: () => ({
      sourcePath: pickRandomPath(),
      destinationPath: pickRandomPath(),
      size: Math.floor(Math.random() * 10000000),
      sha256: generateSha256(),
      movedBy: pickRandom(['current-user', 'system', 'unknown']),
      processName: pickRandom(PROCESS_NAMES),
      crossDevice: Math.random() > 0.8,
    }),
  },
  {
    eventType: 'file-permission-changed',
    trustImpact: -15,
    dataGenerator: () => ({
      path: pickRandomPath(),
      previousPermissions: pickRandom(PERMISSIONS),
      newPermissions: pickRandom(PERMISSIONS),
      changedBy: pickRandom(['current-user', 'root', 'unknown']),
      processName: pickRandom(PROCESS_NAMES),
      isEscalation: Math.random() > 0.6,
      recursive: Math.random() > 0.7,
    }),
  },
  {
    eventType: 'large-file-detected',
    trustImpact: -25,
    dataGenerator: () => ({
      path: pickRandomPath(),
      size: Math.floor(Math.random() * 500000000) + 50000000, // 50MB - 550MB
      sha256: generateSha256(),
      fileType: pickRandom(['archive', 'database', 'disk-image', 'video', 'binary']),
      createdBy: pickRandom(['current-user', 'download-manager', 'unknown']),
      processName: pickRandom(PROCESS_NAMES),
      destination: pickRandom(['local', 'usb-drive', 'network-share', 'cloud-storage']),
      containsSensitive: Math.random() > 0.5,
    }),
  },
];

/**
 * File Watcher adapter.
 * Monitors filesystem activity including file creation, modification,
 * deletion, moves, permission changes, and large file detection.
 * Includes SHA-256 hashes in metadata for integrity verification.
 * Produces simulated events at a configurable interval (default 10 seconds).
 */
export class FileWatcherAdapter extends BaseAdapter {
  readonly id: AdapterType = 'file';
  readonly name = 'File Watcher';
  protected override defaultInterval = 10000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  /**
   * Initialize the File Watcher adapter with optional configuration.
   * @param config - may include pollInterval override
   */
  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[FileWatcherAdapter] Configured for filesystem monitoring');
  }

  /**
   * Start monitoring filesystem activity.
   */
  async start(): Promise<void> {
    await super.start();
    log.info('[FileWatcherAdapter] Monitoring filesystem activity');
  }

  /**
   * Stop monitoring filesystem activity.
   */
  async stop(): Promise<void> {
    await super.stop();
    log.info('[FileWatcherAdapter] Stopped filesystem monitoring');
  }

  /**
   * Destroy the File Watcher adapter and release all resources.
   */
  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[FileWatcherAdapter] File watcher adapter destroyed');
  }

  /**
   * Generate a simulated filesystem event with realistic metadata
   * including file paths, sizes, SHA-256 hashes, and permissions.
   * @returns an AdapterEvent representing filesystem activity
   */
  protected generateSimulatedEvent(): AdapterEvent {
    const template = pickRandom(FILE_EVENTS);
    return {
      adapterId: this.id,
      eventType: template.eventType,
      timestamp: new Date().toISOString(),
      data: template.dataGenerator(),
      trustImpact: template.trustImpact,
    };
  }
}
