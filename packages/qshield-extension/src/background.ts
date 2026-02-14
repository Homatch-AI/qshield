/**
 * Extension service worker — handles periodic health checks, badge icon
 * updates, email signing via the local API, and message routing.
 */
import { QShieldApiClient } from './shared/api-client';
import { loadConfig, onConfigChange } from './shared/storage';

let client: QShieldApiClient | null = null;
let desktopConnected = false;

async function getClient(): Promise<QShieldApiClient> {
  if (!client) {
    const config = await loadConfig();
    client = new QShieldApiClient(config);
  }
  return client;
}

// ── Health check alarm ────────────────────────────────────────────────────────

const HEALTH_ALARM = 'qshield-health-check';

async function checkHealth(): Promise<void> {
  try {
    const api = await getClient();
    const health = await api.health();
    desktopConnected = health.status === 'ok';

    await chrome.action.setBadgeText({ text: desktopConnected ? '' : '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  } catch {
    desktopConnected = false;
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  }
}

chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEALTH_ALARM) {
    checkHealth();
  }
});

// ── Message handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = messageHandlers[message.type as string];
  if (handler) {
    handler(message).then(sendResponse);
    return true; // async response
  }
  return false;
});

const messageHandlers: Record<string, (msg: unknown) => Promise<unknown>> = {
  GET_STATUS: handleGetStatus,
  CHECK_HEALTH: handleCheckHealth,
  GET_CONNECTION: handleGetConnection,
  GET_CONFIG: handleGetConfig,
  SIGN_EMAIL: handleSignEmail,
};

async function handleGetStatus(): Promise<unknown> {
  try {
    const api = await getClient();
    const status = await api.status();
    return { success: true, data: status };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleCheckHealth(): Promise<unknown> {
  await checkHealth();
  return { connected: desktopConnected };
}

async function handleGetConnection(): Promise<unknown> {
  return { connected: desktopConnected };
}

async function handleGetConfig(): Promise<unknown> {
  const config = await loadConfig();
  return { enabled: config.enabled, autoInject: config.autoInject };
}

async function handleSignEmail(msg: unknown): Promise<unknown> {
  const { data } = msg as {
    data: {
      contentHash: string;
      subject?: string;
      recipients: string[];
      timestamp: string;
      platform: string;
    };
  };

  try {
    const api = await getClient();
    const result = await api.signEmail(data);
    return {
      success: true,
      verificationId: result.verificationId,
      badgeHtml: result.badgeHtml,
    };
  } catch (err) {
    console.warn('[QShield] Sign email failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

// ── Config change listener ────────────────────────────────────────────────────

onConfigChange(() => {
  client = null;
  checkHealth();
});

// ── Startup ───────────────────────────────────────────────────────────────────

checkHealth();
console.log('[QShield] Background service worker started');
