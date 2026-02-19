import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileSnapshot {
  hash: string;
  size: number;
  lineCount: number | null;
  permissions: string;
  capturedAt: string;
}

export interface ForensicsResult {
  /** Files involved in the change (single-element for file assets) */
  changedFiles: ChangedFile[];
  /** Process name that has the file open (best-effort, may be null) */
  modifiedBy: string | null;
  /** Human-readable process description */
  processName: string | null;
  /** PID of the process holding the file (may be null) */
  pid: number | null;
  /** Owner user account of the file */
  owner: string | null;
  /** Change summary (size diff, line diff, etc.) */
  changeSummary: string;
  /** Total size change in bytes (negative = smaller) */
  totalSizeChange: number | null;
  /** Octal file permissions string (e.g. "644") */
  filePermissions: string | null;
  /** Whether macOS quarantine xattr is set */
  isQuarantined: boolean;
}

export interface ChangedFile {
  path: string;
  fileName: string;
  changeType: string;
  sizeChange: number | null;
  lineCountChange: number | null;
}

// ---------------------------------------------------------------------------
// Text file detection
// ---------------------------------------------------------------------------

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.toml',
  '.ini', '.cfg', '.conf', '.log', '.env', '.sh', '.bash', '.zsh',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go',
  '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.kt',
  '.html', '.htm', '.css', '.scss', '.less', '.svg', '.sql', '.graphql',
  '.prisma', '.tf', '.hcl', '.dockerfile', '.makefile', '.gitignore',
  '.editorconfig', '.eslintrc', '.prettierrc',
]);

export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has('.' + base);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_TEXT_SIZE = 10 * 1024 * 1024; // 10 MB — skip line counting for huge files

/** Compute SHA-256 hash of a file with a timeout. */
export function computeFileHash(filePath: string, timeoutMs = 10_000): Promise<string> {
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

/** Count lines in a text file. Returns null for binary / large files. */
export async function countFileLines(filePath: string): Promise<number | null> {
  if (!isTextFile(filePath)) return null;

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_TEXT_SIZE) return null;

    const content = await fs.promises.readFile(filePath, 'utf-8');
    // Count newlines; an empty file has 0 lines
    if (content.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') count++;
    }
    // If the file doesn't end with a newline, add 1 for the last line
    if (content[content.length - 1] !== '\n') count++;
    return count;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Process detection (macOS only, best-effort)
// ---------------------------------------------------------------------------

interface ProcessInfo {
  processName: string | null;
  pid: number | null;
}

function detectProcess(filePath: string): Promise<ProcessInfo> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ processName: null, pid: null });
      return;
    }

    const child = execFile('lsof', ['-t', filePath], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve({ processName: null, pid: null });
        return;
      }

      // Take the first PID
      const pidStr = stdout.trim().split('\n')[0];
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) {
        resolve({ processName: null, pid: null });
        return;
      }

      // Get process name from PID
      execFile('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 2000 }, (psErr, psOut) => {
        if (psErr || !psOut.trim()) {
          resolve({ processName: null, pid });
          return;
        }
        const name = path.basename(psOut.trim());
        resolve({ processName: name, pid });
      });
    });

    // Safety: if execFile itself throws synchronously (shouldn't happen)
    child.on('error', () => resolve({ processName: null, pid: null }));
  });
}

// ---------------------------------------------------------------------------
// Owner detection
// ---------------------------------------------------------------------------

async function detectOwner(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    const uid = stat.uid;

    if (process.platform !== 'darwin' && process.platform !== 'linux') {
      return `uid:${uid}`;
    }

    return new Promise((resolve) => {
      execFile('id', ['-un', String(uid)], { timeout: 2000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(`uid:${uid}`);
          return;
        }
        resolve(stdout.trim());
      });
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Quarantine detection (macOS)
// ---------------------------------------------------------------------------

function detectQuarantine(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve(false);
      return;
    }

    execFile('xattr', ['-l', filePath], { timeout: 2000 }, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(stdout.includes('com.apple.quarantine'));
    });
  });
}

// ---------------------------------------------------------------------------
// File permissions
// ---------------------------------------------------------------------------

async function getPermissions(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    return (stat.mode & 0o777).toString(8);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main forensics function
// ---------------------------------------------------------------------------

/**
 * Enrich a file change event with forensic metadata.
 *
 * Gathers process info, owner, permissions, quarantine status, and a
 * human-readable change summary by comparing against a previous snapshot.
 *
 * All external calls (lsof, ps, xattr) have timeouts so this never blocks
 * the main pipeline indefinitely.
 */
export async function enrichFileChange(
  filePath: string,
  changeType: string,
  previousSnapshot?: FileSnapshot,
): Promise<ForensicsResult> {
  const fileName = path.basename(filePath);
  const isDeleted = changeType.includes('deleted');

  // Run all independent probes concurrently — each wrapped to never throw
  const safe = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err) => { log.debug(`[FileForensics] Probe failed: ${err.message}`); return fallback; });

  const [processInfo, owner, quarantined, permissions, currentSize, currentLineCount] =
    await Promise.all([
      isDeleted ? Promise.resolve({ processName: null, pid: null }) : safe(detectProcess(filePath), { processName: null, pid: null }),
      isDeleted ? Promise.resolve(null) : safe(detectOwner(filePath), null),
      isDeleted ? Promise.resolve(false) : safe(detectQuarantine(filePath), false),
      isDeleted ? Promise.resolve(null) : safe(getPermissions(filePath), null),
      isDeleted
        ? Promise.resolve(null)
        : fs.promises.stat(filePath).then((s) => s.size).catch(() => null),
      isDeleted ? Promise.resolve(null) : safe(countFileLines(filePath), null),
    ]);

  // Compute diffs against previous snapshot
  let sizeChange: number | null = null;
  let lineCountChange: number | null = null;
  if (previousSnapshot && currentSize !== null) {
    sizeChange = currentSize - previousSnapshot.size;
  }
  if (previousSnapshot && currentLineCount !== null && previousSnapshot.lineCount !== null) {
    lineCountChange = currentLineCount - previousSnapshot.lineCount;
  }

  // Build human-readable summary
  const summaryParts: string[] = [];
  if (isDeleted) {
    summaryParts.push('File deleted');
    if (previousSnapshot) {
      summaryParts.push(`(was ${formatBytes(previousSnapshot.size)})`);
    }
  } else {
    summaryParts.push(changeType === 'asset-created' ? 'File created' : 'File modified');
    if (sizeChange !== null) {
      const sign = sizeChange >= 0 ? '+' : '';
      summaryParts.push(`size: ${sign}${formatBytes(sizeChange)}`);
    } else if (currentSize !== null) {
      summaryParts.push(`size: ${formatBytes(currentSize)}`);
    }
    if (lineCountChange !== null) {
      const sign = lineCountChange >= 0 ? '+' : '';
      summaryParts.push(`lines: ${sign}${lineCountChange}`);
    }
  }

  const changedFile: ChangedFile = {
    path: filePath,
    fileName,
    changeType,
    sizeChange,
    lineCountChange,
  };

  return {
    changedFiles: [changedFile],
    modifiedBy: processInfo.processName,
    processName: processInfo.processName,
    pid: processInfo.pid,
    owner,
    changeSummary: summaryParts.join(', '),
    totalSizeChange: sizeChange,
    filePermissions: permissions,
    isQuarantined: quarantined,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Capture a snapshot of a file's current state for later comparison.
 */
export async function captureSnapshot(filePath: string): Promise<FileSnapshot | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return null;

    const [hash, lineCount] = await Promise.all([
      computeFileHash(filePath).catch(() => ''),
      countFileLines(filePath),
    ]);

    return {
      hash,
      size: stat.size,
      lineCount,
      permissions: (stat.mode & 0o777).toString(8),
      capturedAt: new Date().toISOString(),
    };
  } catch {
    log.warn(`[FileForensics] Failed to capture snapshot: ${filePath}`);
    return null;
  }
}
