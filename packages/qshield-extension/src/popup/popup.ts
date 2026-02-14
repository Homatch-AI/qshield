import { loadConfig, saveConfig } from '../shared/storage';
import { QShieldApiClient } from '../shared/api-client';

// ── DOM elements ──────────────────────────────────────────────────────────────

const connectionStatus = document.getElementById('connection-status')!;
const editionLabel = document.getElementById('edition-label')!;
const verificationsLabel = document.getElementById('verifications-label')!;
const toggleEnabled = document.getElementById('toggle-enabled') as HTMLInputElement;
const toggleAutoInject = document.getElementById('toggle-auto-inject') as HTMLInputElement;
const apiPort = document.getElementById('api-port') as HTMLInputElement;
const apiToken = document.getElementById('api-token') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn')!;
const testBtn = document.getElementById('test-btn')!;
const messageEl = document.getElementById('message')!;

// ── State ─────────────────────────────────────────────────────────────────────

function showMessage(text: string, type: 'success' | 'error'): void {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  setTimeout(() => {
    messageEl.className = 'message hidden';
  }, 3000);
}

function setConnectionStatus(connected: boolean): void {
  connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
  connectionStatus.className = connected ? 'badge badge-connected' : 'badge badge-disconnected';
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const config = await loadConfig();

  toggleEnabled.checked = config.enabled;
  toggleAutoInject.checked = config.autoInject;
  apiPort.value = String(config.apiPort);
  apiToken.value = config.apiToken;

  // Check connection
  chrome.runtime.sendMessage({ type: 'GET_CONNECTION' }, (response) => {
    if (response) {
      setConnectionStatus(response.connected);
    }
  });

  // Fetch status if connected
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response?.success) {
      editionLabel.textContent = response.data.edition;
      const limit = response.data.dailyLimit === -1 ? '∞' : String(response.data.dailyLimit);
      verificationsLabel.textContent = `${response.data.verificationsToday} / ${limit}`;
    }
  });
}

// ── Event handlers ────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  const port = parseInt(apiPort.value, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    showMessage('Invalid port number (1024–65535)', 'error');
    return;
  }

  await saveConfig({
    apiPort: port,
    apiToken: apiToken.value,
    enabled: toggleEnabled.checked,
    autoInject: toggleAutoInject.checked,
  });

  showMessage('Settings saved', 'success');
});

testBtn.addEventListener('click', async () => {
  const port = parseInt(apiPort.value, 10);
  const token = apiToken.value;

  const testClient = new QShieldApiClient({
    apiPort: port,
    apiToken: token,
    enabled: true,
    autoInject: true,
    badgeStyle: 'compact',
  });

  try {
    const health = await testClient.health();
    setConnectionStatus(true);
    showMessage(`Connected — v${health.version}, trust ${health.trustScore}`, 'success');
  } catch {
    setConnectionStatus(false);
    showMessage('Cannot reach QShield Desktop. Is it running?', 'error');
  }
});

init();
