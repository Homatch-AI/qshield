import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

interface TeamsEventTemplate {
  eventType: string;
  trustImpact: number;
  dataGenerator: () => Record<string, unknown>;
}

const TEAMS_EVENTS: TeamsEventTemplate[] = [
  {
    eventType: 'meeting-started',
    trustImpact: 10,
    dataGenerator: () => ({
      meetingId: `teams-mtg-${Math.floor(Math.random() * 100000)}`,
      organizer: pickRandom(['Sarah Kim', 'James Liu', 'Maria Garcia', 'Tom Brown']),
      participantCount: Math.floor(Math.random() * 20) + 2,
      isScheduled: Math.random() > 0.3,
      hasLobby: Math.random() > 0.4,
    }),
  },
  {
    eventType: 'meeting-ended',
    trustImpact: 5,
    dataGenerator: () => ({
      meetingId: `teams-mtg-${Math.floor(Math.random() * 100000)}`,
      duration: Math.floor(Math.random() * 7200) + 300,
      peakParticipants: Math.floor(Math.random() * 15) + 2,
      recordingCreated: Math.random() > 0.6,
    }),
  },
  {
    eventType: 'chat-message',
    trustImpact: -5,
    dataGenerator: () => ({
      channelId: `ch-${Math.floor(Math.random() * 500)}`,
      channelName: pickRandom(['#general', '#engineering', '#security', '#random', '#incidents']),
      sender: pickRandom(['Sarah Kim', 'James Liu', 'Maria Garcia', 'Tom Brown']),
      hasAttachment: Math.random() > 0.7,
      containsLink: Math.random() > 0.5,
      messageLength: Math.floor(Math.random() * 500) + 10,
    }),
  },
  {
    eventType: 'file-shared',
    trustImpact: -20,
    dataGenerator: () => ({
      fileName: pickRandom([
        'Q4-report.xlsx',
        'architecture-diagram.png',
        'meeting-notes.docx',
        'credentials.txt',
        'budget-2026.pdf',
      ]),
      fileSize: Math.floor(Math.random() * 50000000),
      sharedBy: pickRandom(['Sarah Kim', 'James Liu', 'Maria Garcia']),
      sharedTo: pickRandom(['team', 'channel', 'external']),
      isSensitive: Math.random() > 0.7,
    }),
  },
  {
    eventType: 'call-started',
    trustImpact: 5,
    dataGenerator: () => ({
      callType: pickRandom(['audio', 'video', 'screen-share']),
      callerName: pickRandom(['Sarah Kim', 'James Liu', 'Maria Garcia', 'Tom Brown']),
      isInternal: Math.random() > 0.2,
      encrypted: Math.random() > 0.1,
    }),
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Microsoft Teams adapter.
 * Monitors Teams meetings, chat messages, file sharing, and calls
 * to generate trust signals for the collaboration channel.
 */
export class TeamsAdapter extends BaseAdapter {
  readonly id: AdapterType = 'teams';
  readonly name = 'Microsoft Teams';

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[TeamsAdapter] Configured for Microsoft Teams monitoring');
  }

  async start(): Promise<void> {
    await super.start();
    log.info('[TeamsAdapter] Monitoring Microsoft Teams');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[TeamsAdapter] Stopped Teams monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[TeamsAdapter] Teams adapter destroyed');
  }

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
