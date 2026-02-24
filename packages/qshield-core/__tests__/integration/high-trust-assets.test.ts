import { describe, it, expect } from 'vitest';
import { hmacSha256 } from '../../src/crypto';
import {
  createEvidenceRecord,
  verifyEvidenceChain,
} from '../../src/evidence';
import { hashEvidenceRecord } from '../../src/crypto';
import type { EvidenceRecord } from '../../src/types';

const HMAC_KEY = 'asset-test-key';
const SESSION_ID = 'asset-test-session';

function buildAssetChain(events: Array<{ eventType: string; sensitivity: string }>): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  let prevHash: string | null = null;
  let prevStructureHash: string | null = null;

  for (const { eventType, sensitivity } of events) {
    const record = createEvidenceRecord(
      'file',
      eventType,
      { sensitivity, path: '/test/file.txt' },
      prevHash,
      prevStructureHash,
      SESSION_ID,
      HMAC_KEY,
    );
    records.push(record);
    prevHash = record.hash;
    prevStructureHash = record.structureHash;
  }
  return records;
}

// ── Asset Event → Evidence Pipeline ─────────────────────────────────────────

describe('High-Trust Assets - Evidence Pipeline', () => {
  it('asset-modified event with sensitivity=critical creates evidence', () => {
    const chain = buildAssetChain([{ eventType: 'asset-modified', sensitivity: 'critical' }]);
    expect(chain).toHaveLength(1);
    expect(chain[0].eventType).toBe('asset-modified');
    expect(chain[0].payload).toEqual({ sensitivity: 'critical', path: '/test/file.txt' });
  });

  it('asset-accessed event creates valid evidence', () => {
    const chain = buildAssetChain([{ eventType: 'asset-accessed', sensitivity: 'strict' }]);
    expect(chain[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('asset-created event creates valid record', () => {
    const chain = buildAssetChain([{ eventType: 'asset-created', sensitivity: 'normal' }]);
    expect(chain[0].source).toBe('file');
  });

  it('chain of 5 asset events → evidence chain valid', () => {
    const events = [
      { eventType: 'asset-created', sensitivity: 'critical' },
      { eventType: 'asset-accessed', sensitivity: 'critical' },
      { eventType: 'asset-modified', sensitivity: 'critical' },
      { eventType: 'asset-accessed', sensitivity: 'critical' },
      { eventType: 'asset-modified', sensitivity: 'critical' },
    ];
    const chain = buildAssetChain(events);
    const result = verifyEvidenceChain(chain, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(chain).toHaveLength(5);
  });
});

// ── Trust Impact Calculation ────────────────────────────────────────────────

describe('High-Trust Assets - Trust Impact', () => {
  function computeImpact(changeType: string, sensitivity: string): number {
    const impactMap: Record<string, Record<string, number>> = {
      modified: { critical: -15, high: -8, medium: -3 },
      deleted: { critical: -25, high: -15, medium: -8 },
      accessed: { critical: -8, high: -3, medium: -1 },
      created: { critical: -3, high: -1, medium: 0 },
    };
    return impactMap[changeType]?.[sensitivity] ?? -1;
  }

  it('modified + critical → -15', () => expect(computeImpact('modified', 'critical')).toBe(-15));
  it('modified + high → -8', () => expect(computeImpact('modified', 'high')).toBe(-8));
  it('deleted + critical → -25', () => expect(computeImpact('deleted', 'critical')).toBe(-25));
  it('accessed + critical → -8', () => expect(computeImpact('accessed', 'critical')).toBe(-8));
  it('created + medium → 0', () => expect(computeImpact('created', 'medium')).toBe(0));
  it('unknown changeType → -1', () => expect(computeImpact('unknown', 'critical')).toBe(-1));
});

// ── File Filtering ──────────────────────────────────────────────────────────

describe('High-Trust Assets - File Filtering', () => {
  function shouldIgnoreFile(filePath: string): boolean {
    const ignored = ['.DS_Store', '.Spotlight-V100', '.fseventsd', '.Trashes', '.TemporaryItems'];
    const basename = filePath.split('/').pop() || '';
    if (ignored.some(i => basename.includes(i))) return true;
    if (basename.startsWith('._')) return true;
    if (basename.endsWith('.tmp') || basename.endsWith('.swp')) return true;
    if (basename.startsWith('~')) return true;
    return false;
  }

  it('.DS_Store → ignored', () => expect(shouldIgnoreFile('/Users/test/.DS_Store')).toBe(true));
  it('._metadata → ignored', () => expect(shouldIgnoreFile('/Users/test/._metadata')).toBe(true));
  it('file.tmp → ignored', () => expect(shouldIgnoreFile('/Users/test/file.tmp')).toBe(true));
  it('~$document.docx → ignored', () => expect(shouldIgnoreFile('/Users/test/~$document.docx')).toBe(true));
  it('contract.pdf → NOT ignored', () => expect(shouldIgnoreFile('/Users/test/contract.pdf')).toBe(false));
  it('report.xlsx → NOT ignored', () => expect(shouldIgnoreFile('/Users/test/report.xlsx')).toBe(false));
  it('.swp file → ignored', () => expect(shouldIgnoreFile('/tmp/.file.swp')).toBe(true));
  it('.Spotlight-V100 → ignored', () => expect(shouldIgnoreFile('/vol/.Spotlight-V100')).toBe(true));
});

// ── Access Cooldown ─────────────────────────────────────────────────────────

describe('High-Trust Assets - Alert Cooldown', () => {
  const COOLDOWN_MS = 30000; // 30 seconds

  function shouldAlert(
    assetId: string,
    now: number,
    lastAlertTimes: Map<string, number>,
  ): boolean {
    const lastTime = lastAlertTimes.get(assetId);
    if (lastTime && now - lastTime < COOLDOWN_MS) return false;
    lastAlertTimes.set(assetId, now);
    return true;
  }

  it('first access → alert fires', () => {
    const map = new Map<string, number>();
    expect(shouldAlert('asset-1', 1000, map)).toBe(true);
  });

  it('access 10s later → cooldown, no alert', () => {
    const map = new Map<string, number>();
    shouldAlert('asset-1', 1000, map);
    expect(shouldAlert('asset-1', 11000, map)).toBe(false);
  });

  it('access 31s later → alert fires again', () => {
    const map = new Map<string, number>();
    shouldAlert('asset-1', 1000, map);
    expect(shouldAlert('asset-1', 32000, map)).toBe(true);
  });

  it('different asset → separate cooldown, alert fires immediately', () => {
    const map = new Map<string, number>();
    shouldAlert('asset-1', 1000, map);
    expect(shouldAlert('asset-2', 2000, map)).toBe(true);
  });
});

// ── System Process Filtering ────────────────────────────────────────────────

describe('High-Trust Assets - System Process Filtering', () => {
  const systemProcesses = new Set([
    'mds', 'mdworker', 'fseventsd', 'cloudd', 'kernel_task',
    'Electron', 'QShield', 'lsof', 'usernoted', 'cfprefsd',
  ]);

  function isSystemProcess(name: string): boolean {
    if (systemProcesses.has(name)) return true;
    if (name.startsWith('com.apple.')) return true;
    return false;
  }

  it('mds → system (ignored)', () => expect(isSystemProcess('mds')).toBe(true));
  it('QShield → system (ignored)', () => expect(isSystemProcess('QShield')).toBe(true));
  it('com.apple.finder → system (ignored)', () => expect(isSystemProcess('com.apple.finder')).toBe(true));
  it('vim → NOT system (alert)', () => expect(isSystemProcess('vim')).toBe(false));
  it('node → NOT system (alert)', () => expect(isSystemProcess('node')).toBe(false));
  it('Claude → NOT system (alert)', () => expect(isSystemProcess('Claude')).toBe(false));
  it('Electron → system (self)', () => expect(isSystemProcess('Electron')).toBe(true));
  it('fseventsd → system', () => expect(isSystemProcess('fseventsd')).toBe(true));
});
