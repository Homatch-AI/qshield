import { safeExec } from './safe-exec';

/**
 * Check if any process matching a pattern is running.
 * Uses pgrep on macOS/Linux, tasklist on Windows.
 */
export async function isProcessPatternRunning(pattern: string): Promise<boolean> {
  try {
    const cmd =
      process.platform === 'win32'
        ? `tasklist /FI "IMAGENAME eq ${pattern}*" /NH`
        : `pgrep -f "${pattern}" 2>/dev/null`;
    const result = await safeExec(cmd, { timeout: 3000 });
    if (process.platform === 'win32') {
      return !result.includes('No tasks are running');
    }
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a process has ESTABLISHED TCP connections.
 * Searches lsof output by process name (not domain), which works
 * regardless of -n flag (IP vs hostname).
 * @param processNames - process name patterns to grep for in lsof output
 */
export async function hasProcessEstablishedConnections(processNames: string[]): Promise<boolean> {
  if (process.platform === 'win32') {
    // Windows: use netstat + tasklist correlation (simplified)
    try {
      for (const name of processNames) {
        const result = await safeExec(
          `tasklist /FI "IMAGENAME eq ${name}" /NH 2>NUL`,
          { timeout: 3000 },
        );
        if (!result.includes('No tasks are running')) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // macOS/Linux: grep lsof output for process name + ESTABLISHED
  try {
    const grepPattern = processNames.join('\\|');
    const result = await safeExec(
      `lsof -i -nP 2>/dev/null | grep "${grepPattern}" | grep "ESTABLISHED" | head -1`,
      { timeout: 5000 },
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if camera is in use (macOS only).
 * On macOS, VDCAssistant or AppleCameraAssistant runs when camera is active.
 */
export async function isCameraActive(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const result = await safeExec(
      'pgrep -f "VDCAssistant|AppleCameraAssistant" 2>/dev/null',
      { timeout: 3000 },
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
export async function isMicrophoneActive(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const result = await safeExec(
      'ioreg -l | grep -i "IOAudioEngineState" 2>/dev/null | head -5',
      { timeout: 3000 },
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
export async function isScreenSharing(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const result = await safeExec(
      'pgrep -f "screencapture|CptHost" 2>/dev/null',
      { timeout: 3000 },
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
