import { execSync } from 'node:child_process';
import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

/** Teams process state machine */
type TeamsState = 'idle' | 'running' | 'in-call';

/** Poll interval for process checks (5 seconds) */
const POLL_INTERVAL = 5000;

/**
 * Real Microsoft Teams process monitoring adapter.
 *
 * Detects whether Teams is running locally, whether a call/meeting is
 * active (via network connections + camera/mic heuristics), and emits
 * trust signals for state transitions. Uses a three-state machine:
 *
 *   IDLE → RUNNING → IN_CALL
 *
 * Polls every 5 seconds via setInterval (no simulation timer).
 */
export class TeamsAdapter extends BaseAdapter {
  readonly id: AdapterType = 'teams';
  readonly name = 'Microsoft Teams';
  protected override defaultInterval = POLL_INTERVAL;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private teamsState: TeamsState = 'idle';
  private callStartTime: string | null = null;
  private cameraOn = false;
  private micOn = false;
  private screenShareOn = false;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[TeamsAdapter] Configured for real Teams process monitoring');
  }

  /**
   * Start real process monitoring via setInterval.
   * Does NOT call super.start() — bypasses the simulation timer entirely.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn('[TeamsAdapter] Cannot start: adapter not initialized');
      return;
    }
    this.connected = true;
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
    // Run an initial poll immediately
    this.poll();
    log.info('[TeamsAdapter] Real process monitoring started');
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await super.stop();
    log.info('[TeamsAdapter] Stopped Teams monitoring');
  }

  async destroy(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await super.destroy();
    log.info('[TeamsAdapter] Adapter destroyed');
  }

  /** Required by BaseAdapter but never called — real events come from polling. */
  protected generateSimulatedEvent(): AdapterEvent {
    throw new Error('TeamsAdapter uses real process monitoring, not simulation');
  }

  // ---------------------------------------------------------------------------
  // Simple inline detection (no process-monitor dependency)
  // ---------------------------------------------------------------------------

  private isTeamsRunning(): boolean {
    try {
      const result = execSync(
        'pgrep -f "MSTeams|Microsoft Teams" 2>/dev/null',
        { encoding: 'utf-8', timeout: 3000 },
      );
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  private isInCall(): boolean {
    try {
      // Teams appears as "Microsoft" (truncated) in lsof output
      const result = execSync(
        'lsof -i -nP 2>/dev/null | grep "Microsoft" | grep "ESTABLISHED" | wc -l',
        { encoding: 'utf-8', timeout: 5000 },
      );
      const count = parseInt(result.trim(), 10);
      // Teams maintains many background connections (~8-10 when idle).
      // During a call it opens additional media connections (15+).
      return count >= 15;
    } catch {
      return false;
    }
  }

  private checkCamera(): boolean {
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

  private checkMic(): boolean {
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

  private checkScreenShare(): boolean {
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

  // ---------------------------------------------------------------------------
  // Polling & State Machine
  // ---------------------------------------------------------------------------

  private poll(): void {
    if (!this.connected) return;

    try {
      const teamsRunning = this.isTeamsRunning();
      const inCall = this.isInCall();
      const camera = this.checkCamera();
      const mic = this.checkMic();
      const screenShare = this.checkScreenShare();

      log.info(`[TeamsAdapter] Poll: state=${this.teamsState} running=${teamsRunning} inCall=${inCall} camera=${camera} mic=${mic} screenShare=${screenShare}`);

      const previousState = this.teamsState;

      // Determine new state
      if (!teamsRunning) {
        this.teamsState = 'idle';
      } else if (inCall || camera || mic) {
        this.teamsState = 'in-call';
      } else {
        this.teamsState = 'running';
      }

      // State transitions
      if (previousState !== this.teamsState) {
        this.handleStateTransition(previousState, this.teamsState);
      }

      // Track peripheral changes during a call
      if (this.teamsState === 'in-call') {
        this.trackPeripheralChanges(camera, mic, screenShare);
      }
    } catch (err) {
      this.errorCount++;
      this.lastError = err instanceof Error ? err.message : String(err);
      log.error('[TeamsAdapter] Poll error:', err);
    }
  }

  private handleStateTransition(from: TeamsState, to: TeamsState): void {
    log.info(`[TeamsAdapter] State: ${from} → ${to}`);

    switch (to) {
      case 'running':
        if (from === 'idle') {
          this.emitEvent(this.createEvent('teams-app-opened', 5, {
            previousState: from,
          }));
        } else if (from === 'in-call') {
          // Call ended but Teams still open
          const duration = this.callStartTime
            ? Math.round((Date.now() - new Date(this.callStartTime).getTime()) / 1000)
            : 0;
          this.emitEvent(this.createEvent('call-ended', 5, {
            duration,
            callStartTime: this.callStartTime,
          }));
          this.callStartTime = null;
          this.cameraOn = false;
          this.micOn = false;
          this.screenShareOn = false;
        }
        break;

      case 'in-call':
        this.callStartTime = new Date().toISOString();
        this.emitEvent(this.createEvent('call-started', -10, {
          cameraActive: this.checkCamera(),
          micActive: this.checkMic(),
          screenSharing: this.checkScreenShare(),
        }));
        break;

      case 'idle':
        if (from === 'in-call') {
          const duration = this.callStartTime
            ? Math.round((Date.now() - new Date(this.callStartTime).getTime()) / 1000)
            : 0;
          this.emitEvent(this.createEvent('call-ended', 5, {
            duration,
            callStartTime: this.callStartTime,
            abrupt: true, // Teams closed during call
          }));
          this.callStartTime = null;
        }
        if (from !== 'idle') {
          this.emitEvent(this.createEvent('teams-app-closed', 5, {
            previousState: from,
          }));
        }
        this.cameraOn = false;
        this.micOn = false;
        this.screenShareOn = false;
        break;
    }
  }

  private trackPeripheralChanges(camera: boolean, mic: boolean, screenShare: boolean): void {
    if (camera !== this.cameraOn) {
      this.cameraOn = camera;
      this.emitEvent(this.createEvent(
        camera ? 'camera-activated' : 'camera-deactivated',
        camera ? -5 : 0,
        { cameraActive: camera },
      ));
    }

    if (mic !== this.micOn) {
      this.micOn = mic;
      this.emitEvent(this.createEvent(
        mic ? 'mic-activated' : 'mic-deactivated',
        mic ? -3 : 0,
        { micActive: mic },
      ));
    }

    if (screenShare !== this.screenShareOn) {
      this.screenShareOn = screenShare;
      this.emitEvent(this.createEvent(
        screenShare ? 'screen-share-started' : 'screen-share-stopped',
        screenShare ? -15 : 5,
        { screenSharing: screenShare },
      ));
    }
  }

  private createEvent(
    eventType: string,
    trustImpact: number,
    data: Record<string, unknown>,
  ): AdapterEvent {
    log.info('[TeamsAdapter] REAL EVENT:', eventType, JSON.stringify(data));
    return {
      adapterId: this.id,
      eventType,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        teamsState: this.teamsState,
        platform: process.platform,
      },
      trustImpact,
    };
  }
}
