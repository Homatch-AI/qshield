/**
 * Safe exec API — routes all child_process operations through a forked
 * daemon process that has a clean file descriptor table.
 *
 * This avoids EBADF errors caused by Chromium's multi-process initialization
 * corrupting the inherited FD table from vite-plugin-electron.
 */

import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PendingRequest {
  resolve: (stdout: string) => void;
  reject: (err: Error) => void;
}

let daemon: ChildProcess | null = null;
const pending = new Map<string, PendingRequest>();

/**
 * Fork the exec daemon. Call this once at startup, before Chromium initializes.
 */
export function initExecDaemon(): void {
  if (daemon) return;

  const daemonPath = path.join(__dirname, 'exec-daemon.js');

  daemon = fork(daemonPath, [], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });

  daemon.on('message', (msg: { id: string; stdout?: string; error?: string }) => {
    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);
    if (msg.error) {
      req.reject(new Error(msg.error));
    } else {
      req.resolve(msg.stdout ?? '');
    }
  });

  daemon.on('exit', (code) => {
    // Reject all pending requests
    for (const [id, req] of pending) {
      req.reject(new Error(`Exec daemon exited with code ${code}`));
      pending.delete(id);
    }
    daemon = null;
  });

  console.log('[ExecDaemon] Started');
}

/**
 * Execute a shell command string (replaces execSync).
 */
export function safeExec(
  cmd: string,
  opts?: { timeout?: number; encoding?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!daemon) {
      reject(new Error('Exec daemon not initialized'));
      return;
    }
    const id = randomUUID();
    pending.set(id, { resolve, reject });
    daemon.send({ id, type: 'exec', cmd, opts });
  });
}

/**
 * Execute a file with arguments (replaces execFile).
 */
export function safeExecFile(
  file: string,
  args?: string[],
  opts?: { timeout?: number; encoding?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!daemon) {
      reject(new Error('Exec daemon not initialized'));
      return;
    }
    const id = randomUUID();
    pending.set(id, { resolve, reject });
    daemon.send({ id, type: 'execFile', cmd: file, args, opts });
  });
}

/**
 * Gracefully shut down the exec daemon.
 */
export function shutdownExecDaemon(): void {
  if (!daemon) return;
  try {
    daemon.send('shutdown');
  } catch {
    // Process may already be gone
  }
  daemon = null;
  // Reject any remaining pending requests
  for (const [id, req] of pending) {
    req.reject(new Error('Exec daemon shutting down'));
    pending.delete(id);
  }
  console.log('[ExecDaemon] Shutdown');
}
