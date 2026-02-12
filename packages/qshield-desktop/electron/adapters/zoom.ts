import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface ZoomEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

/** Active meeting IDs for realistic state tracking */
const MEETING_IDS = Array.from({ length: 5 }, (_, i) => `mtg-${100000 + i}`);
const PARTICIPANT_NAMES = [
  'Alice Chen', 'Bob Martinez', 'Carol Park', 'Dave Wilson',
  'Eve Thompson', 'Frank Zhang', 'Grace Lee', 'Hiro Nakamura',
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const ZOOM_EVENTS: ZoomEventTemplate[] = [
  {
    eventType: 'meeting-started',
    trustImpact: 10,
    dataGenerator: () => ({
      meetingId: pickRandom(MEETING_IDS),
      topic: pickRandom([
        'Sprint Planning', 'Design Review', 'Client Sync',
        'Weekly Standup', 'Architecture Discussion',
      ]),
      host: pickRandom(PARTICIPANT_NAMES),
      scheduledDuration: pickRandom([30, 45, 60, 90]) * 60,
      isRecurring: Math.random() > 0.4,
      hasPassword: Math.random() > 0.2,
      waitingRoomEnabled: Math.random() > 0.3,
    }),
  },
  {
    eventType: 'meeting-ended',
    trustImpact: 5,
    dataGenerator: () => ({
      meetingId: pickRandom(MEETING_IDS),
      actualDuration: Math.floor(Math.random() * 5400) + 300,
      peakParticipants: Math.floor(Math.random() * 12) + 2,
      totalParticipants: Math.floor(Math.random() * 20) + 2,
      recordingCreated: Math.random() > 0.6,
    }),
  },
  {
    eventType: 'participant-joined',
    trustImpact: 5,
    dataGenerator: () => ({
      meetingId: pickRandom(MEETING_IDS),
      participantId: `user-${Math.floor(Math.random() * 1000)}`,
      displayName: pickRandom(PARTICIPANT_NAMES),
      joinMethod: pickRandom(['link', 'calendar', 'phone', 'room-system']),
      authenticated: Math.random() > 0.2,
      isInternal: Math.random() > 0.3,
    }),
  },
  {
    eventType: 'participant-left',
    trustImpact: -5,
    dataGenerator: () => ({
      meetingId: pickRandom(MEETING_IDS),
      participantId: `user-${Math.floor(Math.random() * 1000)}`,
      displayName: pickRandom(PARTICIPANT_NAMES),
      duration: Math.floor(Math.random() * 3600),
      reason: pickRandom(['left', 'disconnected', 'host-removed', 'timeout']),
    }),
  },
  {
    eventType: 'screen-share-started',
    trustImpact: -10,
    dataGenerator: () => ({
      meetingId: pickRandom(MEETING_IDS),
      sharedBy: pickRandom(PARTICIPANT_NAMES),
      shareType: pickRandom(['screen', 'window', 'application', 'whiteboard']),
      applicationName: pickRandom(['Chrome', 'VS Code', 'Slack', 'Excel', 'Terminal', 'Figma']),
      resolution: pickRandom(['1920x1080', '2560x1440', '3840x2160']),
    }),
  },
  {
    eventType: 'recording-started',
    trustImpact: -15,
    dataGenerator: () => ({
      meetingId: pickRandom(MEETING_IDS),
      recordingType: pickRandom(['cloud', 'local']),
      initiatedBy: pickRandom(['host', 'co-host', 'participant']),
      consentGiven: Math.random() > 0.3,
      autoTranscription: Math.random() > 0.5,
    }),
  },
  {
    eventType: 'encryption-verified',
    trustImpact: 20,
    dataGenerator: () => ({
      meetingId: pickRandom(MEETING_IDS),
      encryptionType: pickRandom(['e2ee', 'enhanced', 'standard']),
      protocolVersion: pickRandom(['5.0', '5.1', '5.2']),
      verified: true,
      keyExchangeMethod: pickRandom(['ECDH-P256', 'ECDH-P384', 'X25519']),
      cipherSuite: pickRandom(['AES-256-GCM', 'ChaCha20-Poly1305']),
    }),
  },
];

/**
 * Zoom Meetings adapter.
 * Monitors Zoom meeting activity and generates trust signals based on
 * participant behavior, recording status, screen sharing, and encryption
 * verification. Produces simulated events at a configurable interval
 * (default 15 seconds).
 */
export class ZoomAdapter extends BaseAdapter {
  readonly id: AdapterType = 'zoom';
  readonly name = 'Zoom Meetings';
  protected override defaultInterval = 15000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  /**
   * Initialize the Zoom adapter with optional configuration.
   * @param config - may include pollInterval override
   */
  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[ZoomAdapter] Configured for Zoom meeting monitoring');
  }

  /**
   * Start monitoring Zoom meeting events.
   */
  async start(): Promise<void> {
    await super.start();
    log.info('[ZoomAdapter] Monitoring Zoom meetings');
  }

  /**
   * Stop monitoring Zoom meeting events.
   */
  async stop(): Promise<void> {
    await super.stop();
    log.info('[ZoomAdapter] Stopped Zoom monitoring');
  }

  /**
   * Destroy the Zoom adapter and release all resources.
   */
  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[ZoomAdapter] Zoom adapter destroyed');
  }

  /**
   * Generate a simulated Zoom meeting event with realistic metadata.
   * @returns an AdapterEvent representing a Zoom meeting activity
   */
  protected generateSimulatedEvent(): AdapterEvent {
    const template = pickRandom(ZOOM_EVENTS);
    return {
      adapterId: this.id,
      eventType: template.eventType,
      timestamp: new Date().toISOString(),
      data: template.dataGenerator(),
      trustImpact: template.trustImpact,
    };
  }
}
