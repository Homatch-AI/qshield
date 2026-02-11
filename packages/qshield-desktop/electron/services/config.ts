import Store from 'electron-store';
import log from 'electron-log';

interface AppConfig {
  gateway: {
    url: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
  shield: {
    enabled: boolean;
    position: { x: number; y: number };
  };
  notifications: {
    enabled: boolean;
    minSeverity: 'critical' | 'high' | 'medium' | 'low';
  };
  storage: {
    maxSizeMb: number;
    pruneOlderThanDays: number;
  };
}

const defaults: AppConfig = {
  gateway: {
    url: 'http://localhost:8000',
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  shield: {
    enabled: true,
    position: { x: 20, y: 20 },
  },
  notifications: {
    enabled: true,
    minSeverity: 'medium',
  },
  storage: {
    maxSizeMb: 500,
    pruneOlderThanDays: 90,
  },
};

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'qshield-config',
      defaults,
    });
    log.info('ConfigManager initialized');
  }

  /** Get a config value by dot-notation key */
  get(key: string): unknown {
    return this.store.get(key as keyof AppConfig);
  }

  /** Set a config value by dot-notation key */
  set(key: string, value: unknown): void {
    this.store.set(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
    log.info(`Config updated: ${key}`);
  }

  /** Get the entire config */
  getAll(): AppConfig {
    return this.store.store;
  }

  /** Reset to defaults */
  reset(): void {
    this.store.clear();
    log.info('Config reset to defaults');
  }
}
