import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface ZoomEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const ZOOM_EVENTS: ZoomEventTemplate[] = [
  {
    eventType: 'participant-joined',
    trustImpact: 5,
    dataGenerator: () => ({
      participantId: `user-${Math.floor(Math.random() * 1000)}`,
      displayName: pickRandom(['Alice Chen', 'Bob Martinez', 'Carol Park', 'Dave Wilson']),
      joinMethod: pickRandom(['link', 'calendar', 'phone']),
      authenticated: Math.random() > 0.2,
    }),
  },
  {
    eventType: 'participant-left',
    trustImpact: -5,
    dataGenerator: () => ({
      participantId: `user-${Math.floor(Math.random() * 1000)}`,
      displayName: pickRandom(['Alice Chen', 'Bob Martinez', 'Carol Park', 'Dave Wilson']),
      duration: Math.floor(Math.random() * 3600),
      reason: pickRandom(['left', 'disconnected', 'host-removed']),
    }),
  },
  {
    eventType: 'recording-started',
    trustImpact: -15,
    dataGenerator: () => ({
      recordingType: pickRandom(['cloud', 'local']),
      initiatedBy: pickRandom(['host', 'co-host', 'participant']),
      consentGiven: Math.random() > 0.3,
      meetingId: `mtg-${Math.floor(Math.random() * 100000)}`,
    }),
  },
  {
    eventType: 'screen-share-started',
    trustImpact: -10,
    dataGenerator: () => ({
      sharedBy: pickRandom(['Alice Chen', 'Bob Martinez', 'Carol Park']),
      shareType: pickRandom(['screen', 'window', 'application']),
      applicationName: pickRandom(['Chrome', 'VS Code', 'Slack', 'Excel', 'Terminal']),
    }),
  },
  {
    eventType: 'encryption-verified',
    trustImpact: 20,
    dataGenerator: () => ({
      encryptionType: pickRandom(['e2ee', 'enhanced', 'standard']),
      protocolVersion: '5.0',
      verified: true,
      meetingId: `mtg-${Math.floor(Math.random() * 100000)}`,
    }),
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Zoom Meetings adapter.
 * Monitors Zoom meeting activity and generates trust signals based on
 * participant behavior, recording status, and encryption verification.
 */
export class ZoomAdapter extends BaseAdapter {
  readonly id: AdapterType = 'zoom';
  readonly name = 'Zoom Meetings';

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[ZoomAdapter] Configured for Zoom meeting monitoring');
  }

  async start(): Promise<void> {
    await super.start();
    log.info('[ZoomAdapter] Monitoring Zoom meetings');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[ZoomAdapter] Stopped Zoom monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[ZoomAdapter] Zoom adapter destroyed');
  }

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
