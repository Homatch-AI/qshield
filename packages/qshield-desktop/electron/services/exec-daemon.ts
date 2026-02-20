/**
 * Exec Daemon — lightweight Node.js child process with a clean FD table.
 *
 * Forked at startup before Chromium corrupts the file descriptor table.
 * All shell command execution routes through this process via IPC.
 */

import { execSync, execFile } from 'node:child_process';

interface ExecRequest {
  id: string;
  type: 'exec' | 'execFile';
  cmd: string;
  args?: string[];
  opts?: { timeout?: number; encoding?: string; maxBuffer?: number };
}

interface ExecResponse {
  id: string;
  stdout?: string;
  error?: string;
}

process.on('message', (msg: ExecRequest | 'shutdown') => {
  if (msg === 'shutdown') {
    process.exit(0);
  }

  const req = msg as ExecRequest;
  const opts = { encoding: 'utf-8' as BufferEncoding, timeout: 10_000, ...req.opts };

  try {
    if (req.type === 'exec') {
      const stdout = execSync(req.cmd, opts) as unknown as string;
      process.send!({ id: req.id, stdout: stdout ?? '' } satisfies ExecResponse);
    } else {
      execFile(req.cmd, req.args ?? [], opts, (err, stdout) => {
        if (err) {
          process.send!({ id: req.id, error: err.message } satisfies ExecResponse);
        } else {
          process.send!({ id: req.id, stdout: (stdout ?? '').toString() } satisfies ExecResponse);
        }
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.send!({ id: req.id, error: message } satisfies ExecResponse);
  }
});
