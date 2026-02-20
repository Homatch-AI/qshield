import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';
import { safeExec } from '../services/safe-exec';

/** Zoom process state machine */
type ZoomState = 'idle' | 'running' | 'in-meeting';

/** Poll interval for process checks (5 seconds) */
const POLL_INTERVAL = 5000;

/**
 * Real Zoom process monitoring adapter.
 *
 * Detects whether Zoom is running locally, whether a meeting is active
 * (via network connections + camera/mic heuristics), and emits trust
 * signals for state transitions. Uses a three-state machine:
 *
 *   IDLE → RUNNING → IN_MEETING
 *
 * Polls every 5 seconds via setInterval (no simulation timer).
 */
export class ZoomAdapter extends BaseAdapter {
  readonly id: AdapterType = 'zoom';
  readonly name = 'Zoom Meetings';
  protected override defaultInterval = POLL_INTERVAL;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private zoomState: ZoomState = 'idle';
  private meetingStartTime: string | null = null;
  private cameraOn = false;
  private micOn = false;
  private screenShareOn = false;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[ZoomAdapter] Configured for real Zoom process monitoring');
  }

  /**
   * Start real process monitoring via setInterval.
   * Does NOT call super.start() — bypasses the simulation timer entirely.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn('[ZoomAdapter] Cannot start: adapter not initialized');
      return;
    }
    this.connected = true;
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
    // Run an initial poll immediately
    this.poll();
    log.info('[ZoomAdapter] Real process monitoring started');
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await super.stop();
    log.info('[ZoomAdapter] Stopped Zoom monitoring');
  }

  async destroy(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await super.destroy();
    log.info('[ZoomAdapter] Adapter destroyed');
  }

  /** Required by BaseAdapter but never called — real events come from polling. */
  protected generateSimulatedEvent(): AdapterEvent {
    throw new Error('ZoomAdapter uses real process monitoring, not simulation');
  }

  // ---------------------------------------------------------------------------
  // Simple inline detection (no process-monitor dependency)
  // ---------------------------------------------------------------------------

  private async isZoomRunning(): Promise<boolean> {
    try {
      const result = await safeExec(
        'pgrep -x "zoom.us" 2>/dev/null',
        { timeout: 3000 },
      );
      const found = result.trim().length > 0;
      log.info(`[ZoomAdapter] pgrep result: found=${found} pids="${result.trim().split('\n').join(',')}"`)
      return found;
    } catch (e) {
      log.info(`[ZoomAdapter] pgrep FAILED:`, (e as Error).message?.slice(0, 120));
      return false;
    }
  }

  private async isInMeeting(): Promise<boolean> {
    try {
      const result = await safeExec(
        'lsof -i -nP 2>/dev/null | grep "zoom.us" | grep "ESTABLISHED" | wc -l',
        { timeout: 5000 },
      );
      const count = parseInt(result.trim(), 10);
      log.info(`[ZoomAdapter] lsof ESTABLISHED count: ${count}`);
      // More than 3 established connections = likely in a meeting
      // Zoom idle typically has 0-2, in-meeting has 5+
      return count >= 3;
    } catch (e) {
      log.info(`[ZoomAdapter] lsof FAILED:`, (e as Error).message?.slice(0, 120));
      return false;
    }
  }

  private async checkCamera(): Promise<boolean> {
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

  private async checkMic(): Promise<boolean> {
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

  private async checkScreenShare(): Promise<boolean> {
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

  // ---------------------------------------------------------------------------
  // Polling & State Machine
  // ---------------------------------------------------------------------------

  private async poll(): Promise<void> {
    if (!this.connected) return;

    try {
      const zoomRunning = await this.isZoomRunning();
      const inMeeting = await this.isInMeeting();
      const camera = await this.checkCamera();
      const mic = await this.checkMic();
      const screenShare = await this.checkScreenShare();

      log.info(`[ZoomAdapter] Poll: state=${this.zoomState} running=${zoomRunning} inMeeting=${inMeeting} camera=${camera} mic=${mic} screenShare=${screenShare}`);

      const previousState = this.zoomState;

      // Determine new state
      if (!zoomRunning) {
        this.zoomState = 'idle';
      } else if (inMeeting || camera || mic) {
        this.zoomState = 'in-meeting';
      } else {
        this.zoomState = 'running';
      }

      // State transitions
      if (previousState !== this.zoomState) {
        this.handleStateTransition(previousState, this.zoomState, camera, mic, screenShare);
      }

      // Track peripheral changes during a meeting
      if (this.zoomState === 'in-meeting') {
        this.trackPeripheralChanges(camera, mic, screenShare);
      }
    } catch (err) {
      this.errorCount++;
      this.lastError = err instanceof Error ? err.message : String(err);
      log.error('[ZoomAdapter] Poll error:', err);
    }
  }

  private handleStateTransition(from: ZoomState, to: ZoomState, camera: boolean, mic: boolean, screenShare: boolean): void {
    log.info(`[ZoomAdapter] State: ${from} → ${to}`);

    switch (to) {
      case 'running':
        if (from === 'idle') {
          this.emitEvent(this.createEvent('zoom-app-opened', 5, {
            previousState: from,
          }));
        } else if (from === 'in-meeting') {
          // Meeting ended but Zoom still open
          const duration = this.meetingStartTime
            ? Math.round((Date.now() - new Date(this.meetingStartTime).getTime()) / 1000)
            : 0;
          this.emitEvent(this.createEvent('meeting-ended', 5, {
            duration,
            meetingStartTime: this.meetingStartTime,
          }));
          this.meetingStartTime = null;
          this.cameraOn = false;
          this.micOn = false;
          this.screenShareOn = false;
        }
        break;

      case 'in-meeting':
        this.meetingStartTime = new Date().toISOString();
        this.emitEvent(this.createEvent('meeting-started', -10, {
          cameraActive: camera,
          micActive: mic,
          screenSharing: screenShare,
        }));
        break;

      case 'idle':
        if (from === 'in-meeting') {
          const duration = this.meetingStartTime
            ? Math.round((Date.now() - new Date(this.meetingStartTime).getTime()) / 1000)
            : 0;
          this.emitEvent(this.createEvent('meeting-ended', 5, {
            duration,
            meetingStartTime: this.meetingStartTime,
            abrupt: true, // Zoom closed during meeting
          }));
          this.meetingStartTime = null;
        }
        if (from !== 'idle') {
          this.emitEvent(this.createEvent('zoom-app-closed', 5, {
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
    log.info('[ZoomAdapter] REAL EVENT:', eventType, JSON.stringify(data));
    return {
      adapterId: this.id,
      eventType,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        zoomState: this.zoomState,
        platform: process.platform,
      },
      trustImpact,
    };
  }
}
