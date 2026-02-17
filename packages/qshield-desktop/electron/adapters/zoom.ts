import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';
import {
  isProcessPatternRunning,
  hasProcessEstablishedConnections,
  isCameraActive,
  isMicrophoneActive,
  isScreenSharing,
} from '../services/process-monitor';

/** Zoom process state machine */
type ZoomState = 'idle' | 'running' | 'in-meeting';

/** Poll interval for process checks (5 seconds) */
const POLL_INTERVAL = 5000;

/** Zoom-related process patterns by platform */
const ZOOM_PROCESS_PATTERNS: Record<string, string[]> = {
  darwin: ['zoom.us'],
  win32: ['Zoom.exe', 'Zoom'],
  linux: ['zoom', 'ZoomLauncher'],
};

/** Zoom process names to look for in lsof ESTABLISHED connections */
const ZOOM_LSOF_NAMES = ['zoom.us', 'zoom_us', 'Zoom'];

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
  // Polling & State Machine
  // ---------------------------------------------------------------------------

  private poll(): void {
    if (!this.connected) return;

    try {
      const platform = process.platform as string;
      const patterns = ZOOM_PROCESS_PATTERNS[platform] ?? ZOOM_PROCESS_PATTERNS.linux;

      const zoomRunning = patterns.some((p) => isProcessPatternRunning(p));
      const hasZoomConnections = hasProcessEstablishedConnections(ZOOM_LSOF_NAMES);
      const camera = isCameraActive();
      const mic = isMicrophoneActive();
      const screenShare = isScreenSharing();

      log.info('[ZoomAdapter] Poll:', {
        state: this.zoomState, zoomRunning, hasZoomConnections, camera, mic, screenShare,
      });

      const previousState = this.zoomState;

      // Determine new state
      if (!zoomRunning) {
        this.zoomState = 'idle';
      } else if (hasZoomConnections || camera || mic) {
        this.zoomState = 'in-meeting';
      } else {
        this.zoomState = 'running';
      }

      // State transitions
      if (previousState !== this.zoomState) {
        this.handleStateTransition(previousState, this.zoomState);
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

  private handleStateTransition(from: ZoomState, to: ZoomState): void {
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
          cameraActive: isCameraActive(),
          micActive: isMicrophoneActive(),
          screenSharing: isScreenSharing(),
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
