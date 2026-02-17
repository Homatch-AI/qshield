import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';
import {
  isProcessPatternRunning,
  hasActiveConnections,
  isCameraActive,
  isMicrophoneActive,
  isScreenSharing,
} from '../services/process-monitor';

/** Teams process state machine */
type TeamsState = 'idle' | 'running' | 'in-call';

/** Poll interval for process checks (5 seconds) */
const POLL_INTERVAL = 5000;

/** Teams-related process patterns by platform */
const TEAMS_PROCESS_PATTERNS: Record<string, string[]> = {
  darwin: ['Microsoft Teams', 'MSTeams'],
  win32: ['Teams.exe', 'ms-teams.exe', 'MSTeams.exe'],
  linux: ['teams', 'teams-for-linux'],
};

/** Teams network domain patterns */
const TEAMS_DOMAINS = [
  'teams.microsoft.com',
  'teams.live.com',
  '.teams.microsoft',
  'trouter.teams',
  'skype.com',
];

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
  // Polling & State Machine
  // ---------------------------------------------------------------------------

  private poll(): void {
    if (!this.connected) return;

    try {
      const platform = process.platform as string;
      const patterns = TEAMS_PROCESS_PATTERNS[platform] ?? TEAMS_PROCESS_PATTERNS.linux;

      const teamsRunning = patterns.some((p) => isProcessPatternRunning(p));
      const hasNetwork = hasActiveConnections(TEAMS_DOMAINS);
      const camera = isCameraActive();
      const mic = isMicrophoneActive();
      const screenShare = isScreenSharing();

      const previousState = this.teamsState;

      // Determine new state
      if (!teamsRunning) {
        this.teamsState = 'idle';
      } else if (hasNetwork && (camera || mic)) {
        // Teams is always connected to network when running, so require
        // camera or mic to distinguish a call from normal usage
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
          cameraActive: isCameraActive(),
          micActive: isMicrophoneActive(),
          screenSharing: isScreenSharing(),
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
