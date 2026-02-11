import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface FileEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const FILE_EVENTS: FileEventTemplate[] = [
  {
    eventType: 'file-created',
    trustImpact: 0,
    dataGenerator: () => ({
      path: pickRandom([
        '/Documents/reports/new-report.docx',
        '/Downloads/installer.dmg',
        '/Desktop/screenshot.png',
        '/Projects/src/main.ts',
        '/tmp/upload-cache-001.dat',
      ]),
      size: Math.floor(Math.random() * 10000000),
      owner: 'current-user',
      extension: pickRandom(['.docx', '.dmg', '.png', '.ts', '.dat']),
      isInMonitoredDir: Math.random() > 0.3,
    }),
  },
  {
    eventType: 'file-modified',
    trustImpact: -5,
    dataGenerator: () => ({
      path: pickRandom([
        '/etc/hosts',
        '/Documents/sensitive-data.csv',
        '/Projects/config.json',
        '/.ssh/known_hosts',
        '/Library/Preferences/com.app.plist',
      ]),
      previousSize: Math.floor(Math.random() * 5000000),
      newSize: Math.floor(Math.random() * 5000000),
      modifiedBy: pickRandom(['current-user', 'system', 'unknown-process']),
      isSystemFile: Math.random() > 0.6,
    }),
  },
  {
    eventType: 'file-deleted',
    trustImpact: -10,
    dataGenerator: () => ({
      path: pickRandom([
        '/Documents/old-report.docx',
        '/tmp/session-cache.dat',
        '/Downloads/archive.zip',
        '/Projects/build/output.js',
        '/Logs/app.log.old',
      ]),
      size: Math.floor(Math.random() * 20000000),
      deletedBy: pickRandom(['current-user', 'scheduled-task', 'unknown']),
      recoverable: Math.random() > 0.4,
    }),
  },
  {
    eventType: 'file-accessed',
    trustImpact: 5,
    dataGenerator: () => ({
      path: pickRandom([
        '/Documents/credentials-vault.kdbx',
        '/Projects/.env',
        '/.ssh/id_rsa',
        '/Documents/hr-records.xlsx',
        '/Library/Keychains/login.keychain-db',
      ]),
      accessedBy: pickRandom(['current-user', 'sudo', 'background-service']),
      accessType: pickRandom(['read', 'read-write', 'execute']),
      isSensitive: Math.random() > 0.4,
      processName: pickRandom(['Finder', 'Terminal', 'node', 'python3', 'unknown']),
    }),
  },
  {
    eventType: 'large-transfer-detected',
    trustImpact: -25,
    dataGenerator: () => ({
      direction: pickRandom(['upload', 'download', 'copy-to-external']),
      totalSize: Math.floor(Math.random() * 500000000) + 50000000, // 50MB - 550MB
      fileCount: Math.floor(Math.random() * 100) + 1,
      destination: pickRandom([
        'USB drive',
        'cloud-storage',
        'network-share',
        'external-api',
        'airdrop',
      ]),
      containsSensitive: Math.random() > 0.5,
      transferRate: Math.floor(Math.random() * 100000000), // bytes/sec
    }),
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * File Watcher adapter.
 * Monitors filesystem activity including file creation, modification,
 * deletion, access, and large data transfers.
 */
export class FileWatcherAdapter extends BaseAdapter {
  readonly id: AdapterType = 'file';
  readonly name = 'File Watcher';

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[FileWatcherAdapter] Configured for filesystem monitoring');
  }

  async start(): Promise<void> {
    await super.start();
    log.info('[FileWatcherAdapter] Monitoring filesystem activity');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[FileWatcherAdapter] Stopped filesystem monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[FileWatcherAdapter] File watcher adapter destroyed');
  }

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
