import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface TeamsEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const USER_NAMES = [
  'Sarah Kim', 'James Liu', 'Maria Garcia', 'Tom Brown',
  'Priya Patel', 'Alex Novak', 'Yuki Tanaka', 'Omar Hassan',
];
const CHANNEL_NAMES = [
  '#general', '#engineering', '#security', '#random',
  '#incidents', '#design', '#devops', '#announcements',
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const TEAMS_EVENTS: TeamsEventTemplate[] = [
  {
    eventType: 'presence-changed',
    trustImpact: 0,
    dataGenerator: () => ({
      userId: `user-${Math.floor(Math.random() * 500)}`,
      userName: pickRandom(USER_NAMES),
      previousStatus: pickRandom(['available', 'busy', 'dnd', 'away', 'offline']),
      newStatus: pickRandom(['available', 'busy', 'dnd', 'away', 'offline']),
      device: pickRandom(['desktop', 'mobile', 'web']),
      lastSeen: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
    }),
  },
  {
    eventType: 'message-sent',
    trustImpact: -5,
    dataGenerator: () => ({
      channelId: `ch-${Math.floor(Math.random() * 500)}`,
      channelName: pickRandom(CHANNEL_NAMES),
      sender: pickRandom(USER_NAMES),
      hasAttachment: Math.random() > 0.7,
      containsLink: Math.random() > 0.5,
      messageLength: Math.floor(Math.random() * 500) + 10,
      isExternal: Math.random() > 0.8,
      mentionsCount: Math.floor(Math.random() * 5),
    }),
  },
  {
    eventType: 'message-received',
    trustImpact: 0,
    dataGenerator: () => ({
      channelId: `ch-${Math.floor(Math.random() * 500)}`,
      channelName: pickRandom(CHANNEL_NAMES),
      sender: pickRandom(USER_NAMES),
      hasAttachment: Math.random() > 0.7,
      containsLink: Math.random() > 0.5,
      messageLength: Math.floor(Math.random() * 500) + 10,
      isExternal: Math.random() > 0.8,
    }),
  },
  {
    eventType: 'call-started',
    trustImpact: 5,
    dataGenerator: () => ({
      callId: `call-${Math.floor(Math.random() * 100000)}`,
      callType: pickRandom(['audio', 'video', 'screen-share']),
      callerName: pickRandom(USER_NAMES),
      isInternal: Math.random() > 0.2,
      encrypted: Math.random() > 0.1,
      participants: Math.floor(Math.random() * 8) + 2,
    }),
  },
  {
    eventType: 'call-ended',
    trustImpact: 5,
    dataGenerator: () => ({
      callId: `call-${Math.floor(Math.random() * 100000)}`,
      duration: Math.floor(Math.random() * 3600) + 60,
      peakParticipants: Math.floor(Math.random() * 8) + 2,
      qualityScore: Math.round((Math.random() * 2 + 3) * 10) / 10, // 3.0-5.0
      recordingCreated: Math.random() > 0.7,
    }),
  },
  {
    eventType: 'file-shared',
    trustImpact: -20,
    dataGenerator: () => ({
      fileName: pickRandom([
        'Q4-report.xlsx', 'architecture-diagram.png', 'meeting-notes.docx',
        'credentials.txt', 'budget-2026.pdf', 'customer-data.csv',
      ]),
      fileSize: Math.floor(Math.random() * 50000000),
      sharedBy: pickRandom(USER_NAMES),
      sharedTo: pickRandom(['team', 'channel', 'external', 'organization']),
      channelName: pickRandom(CHANNEL_NAMES),
      isSensitive: Math.random() > 0.7,
      dlpClassification: pickRandom(['public', 'internal', 'confidential', 'restricted']),
    }),
  },
];

/**
 * Microsoft Teams adapter.
 * Monitors Teams presence changes, messaging, calls, and file sharing
 * to generate trust signals for the collaboration channel.
 * Produces simulated events at a configurable interval (default 20 seconds).
 */
export class TeamsAdapter extends BaseAdapter {
  readonly id: AdapterType = 'teams';
  readonly name = 'Microsoft Teams';
  protected override defaultInterval = 20000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  /**
   * Initialize the Teams adapter with optional configuration.
   * @param config - may include pollInterval override
   */
  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[TeamsAdapter] Configured for Microsoft Teams monitoring');
  }

  /**
   * Start monitoring Microsoft Teams events.
   */
  async start(): Promise<void> {
    await super.start();
    log.info('[TeamsAdapter] Monitoring Microsoft Teams');
  }

  /**
   * Stop monitoring Microsoft Teams events.
   */
  async stop(): Promise<void> {
    await super.stop();
    log.info('[TeamsAdapter] Stopped Teams monitoring');
  }

  /**
   * Destroy the Teams adapter and release all resources.
   */
  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[TeamsAdapter] Teams adapter destroyed');
  }

  /**
   * Generate a simulated Teams event with realistic metadata.
   * @returns an AdapterEvent representing a Teams activity
   */
  protected generateSimulatedEvent(): AdapterEvent {
    const template = pickRandom(TEAMS_EVENTS);
    return {
      adapterId: this.id,
      eventType: template.eventType,
      timestamp: new Date().toISOString(),
      data: template.dataGenerator(),
      trustImpact: template.trustImpact,
    };
  }
}
