import type { QShieldConfig } from './types';
import { DEFAULT_CONFIG } from './types';

const STORAGE_KEY = 'qshield_config';

/** Load the extension config from chrome.storage.local. */
export async function loadConfig(): Promise<QShieldConfig> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    return { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] };
  }
  return { ...DEFAULT_CONFIG };
}

/** Save the extension config to chrome.storage.local. */
export async function saveConfig(config: Partial<QShieldConfig>): Promise<QShieldConfig> {
  const current = await loadConfig();
  const merged = { ...current, ...config };
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return merged;
}

/** Listen for config changes. Returns an unsubscribe function. */
export function onConfigChange(callback: (config: QShieldConfig) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (changes[STORAGE_KEY]?.newValue) {
      callback({ ...DEFAULT_CONFIG, ...changes[STORAGE_KEY].newValue });
    }
  };
  chrome.storage.local.onChanged.addListener(listener);
  return () => chrome.storage.local.onChanged.removeListener(listener);
}
