import { execSync } from 'node:child_process';

/**
 * Check if any process matching a pattern is running.
 * Uses pgrep on macOS/Linux, tasklist on Windows.
 */
export function isProcessPatternRunning(pattern: string): boolean {
  try {
    const cmd =
      process.platform === 'win32'
        ? `tasklist /FI "IMAGENAME eq ${pattern}*" /NH`
        : `pgrep -f "${pattern}" 2>/dev/null`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 3000 });
    if (process.platform === 'win32') {
      return !result.includes('No tasks are running');
    }
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get active network connections matching specific patterns.
 * Returns true if there are active connections to the specified domains/IPs.
 */
export function hasActiveConnections(domainPatterns: string[]): boolean {
  try {
    const cmd =
      process.platform === 'win32'
        ? 'netstat -an'
        : 'lsof -i -nP 2>/dev/null | head -200';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    return domainPatterns.some((pattern) => result.includes(pattern));
  } catch {
    return false;
  }
}

/**
 * Check if camera is in use (macOS only).
 * On macOS, VDCAssistant or AppleCameraAssistant runs when camera is active.
 */
export function isCameraActive(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    const result = execSync(
      'pgrep -f "VDCAssistant|AppleCameraAssistant" 2>/dev/null',
      { encoding: 'utf-8', timeout: 3000 },
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if microphone is in use (macOS only).
 * Uses IOAudioEngineState as a heuristic.
 */
export function isMicrophoneActive(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    const result = execSync(
      'ioreg -l | grep -i "IOAudioEngineState" 2>/dev/null | head -5',
      { encoding: 'utf-8', timeout: 3000 },
    );
    return result.includes('1');
  } catch {
    return false;
  }
}

/**
 * Check if screen sharing is active (macOS only).
 * Detects screencapture or CptHost (Zoom screen share) processes.
 */
export function isScreenSharing(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    const result = execSync(
      'pgrep -f "screencapture|CptHost" 2>/dev/null',
      { encoding: 'utf-8', timeout: 3000 },
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
