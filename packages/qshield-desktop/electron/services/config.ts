/**
 * Typed configuration manager with persistence, defaults, and migration support.
 * Uses electron-store for atomic writes and cross-platform storage.
 */
import Store from 'electron-store';
import log from 'electron-log';

// ── Config schema ────────────────────────────────────────────────────────────

/** Window position and size state */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/** Shield overlay positioning */
export interface ShieldOverlayConfig {
  enabled: boolean;
  /** Anchor corner: which screen corner the overlay is near */
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Margin from the anchored corner in pixels */
  margin: number;
  /** Overlay opacity from 0.1 to 1.0 */
  opacity: number;
}

/** Gateway connection configuration */
export interface GatewayConfig {
  url: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  /** Whether the user has authenticated with the gateway */
  authenticated: boolean;
}

/** Notification preferences */
export interface NotificationConfig {
  enabled: boolean;
  minSeverity: 'critical' | 'high' | 'medium' | 'low';
  /** Play sound on critical alerts */
  soundEnabled: boolean;
}

/** Storage/evidence vault limits */
export interface StorageConfig {
  maxSizeMb: number;
  pruneOlderThanDays: number;
}

/** Adapter enabled states, keyed by adapter ID */
export interface AdapterStates {
  zoom: boolean;
  teams: boolean;
  email: boolean;
  file: boolean;
  api: boolean;
}

/** Full application configuration schema */
export interface AppConfig {
  /** Config schema version for migrations */
  configVersion: number;
  gateway: GatewayConfig;
  shield: ShieldOverlayConfig;
  notifications: NotificationConfig;
  storage: StorageConfig;
  adapters: AdapterStates;
  /** Persisted main window bounds (null = use defaults) */
  windowBounds: WindowBounds | null;
  /** Last known trust score, saved for crash recovery */
  lastTrustScore: number | null;
  /** Crash recovery flag — set true before shutdown, cleared on clean startup */
  cleanShutdown: boolean;
}

/** Current config schema version */
const CURRENT_CONFIG_VERSION = 1;

/** Default configuration values */
const defaults: AppConfig = {
  configVersion: CURRENT_CONFIG_VERSION,
  gateway: {
    url: 'http://localhost:8000',
    timeout: 10_000,
    retryAttempts: 3,
    retryDelay: 1000,
    authenticated: false,
  },
  shield: {
    enabled: true,
    anchor: 'top-right',
    margin: 20,
    opacity: 1.0,
  },
  notifications: {
    enabled: true,
    minSeverity: 'medium',
    soundEnabled: true,
  },
  storage: {
    maxSizeMb: 500,
    pruneOlderThanDays: 90,
  },
  adapters: {
    zoom: true,
    teams: true,
    email: false,
    file: false,
    api: false,
  },
  windowBounds: null,
  lastTrustScore: null,
  cleanShutdown: true,
};

// ── Migrations ───────────────────────────────────────────────────────────────

type Migration = (store: Store<AppConfig>) => void;

/**
 * Ordered migration functions indexed by target version.
 * Each migration transforms the store from version N-1 to N.
 */
const migrations: Record<number, Migration> = {
  // Version 1: initial schema — no migration needed from 0.
  // Future example:
  // 2: (store) => {
  //   // Add new field with default
  //   if (!store.has('someNewKey')) {
  //     store.set('someNewKey', 'defaultValue');
  //   }
  //   store.set('configVersion', 2);
  // },
};

/** Run any pending migrations */
function runMigrations(store: Store<AppConfig>): void {
  const currentVersion = (store.get('configVersion') as number) ?? 0;

  if (currentVersion >= CURRENT_CONFIG_VERSION) return;

  log.info(`Migrating config from v${currentVersion} to v${CURRENT_CONFIG_VERSION}`);

  for (let v = currentVersion + 1; v <= CURRENT_CONFIG_VERSION; v++) {
    const migrate = migrations[v];
    if (migrate) {
      log.info(`Running config migration to v${v}`);
      migrate(store);
    }
  }

  store.set('configVersion', CURRENT_CONFIG_VERSION);
  log.info('Config migration complete');
}

// ── ConfigManager class ──────────────────────────────────────────────────────

/**
 * Manages application configuration with typed access, persistence, and migrations.
 * All config changes are immediately persisted to disk.
 */
export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'qshield-config',
      defaults,
    });

    runMigrations(this.store);
    log.info('ConfigManager initialized (v%d)', this.store.get('configVersion'));
  }

  /** Get a config value by dot-notation key */
  get(key: string): unknown {
    return this.store.get(key as keyof AppConfig);
  }

  /** Set a config value by dot-notation key */
  set(key: string, value: unknown): void {
    this.store.set(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
    log.debug(`Config updated: ${key}`);
  }

  /** Get the entire config object */
  getAll(): AppConfig {
    return this.store.store;
  }

  /** Reset config to defaults */
  reset(): void {
    this.store.clear();
    log.info('Config reset to defaults');
  }

  // ── Typed accessors ──────────────────────────────────────────────────

  /** Get saved window bounds or null */
  getWindowBounds(): WindowBounds | null {
    return this.store.get('windowBounds');
  }

  /** Save window bounds (called on window close/resize) */
  setWindowBounds(bounds: WindowBounds): void {
    this.store.set('windowBounds', bounds);
  }

  /** Get shield overlay config */
  getShieldConfig(): ShieldOverlayConfig {
    return this.store.get('shield');
  }

  /** Get gateway config */
  getGatewayConfig(): GatewayConfig {
    return this.store.get('gateway');
  }

  /** Get adapter enabled states */
  getAdapterStates(): AdapterStates {
    return this.store.get('adapters');
  }

  /** Mark clean shutdown (called at start of shutdown sequence) */
  setCleanShutdown(clean: boolean): void {
    this.store.set('cleanShutdown', clean);
  }

  /** Check whether previous shutdown was clean */
  wasCleanShutdown(): boolean {
    return this.store.get('cleanShutdown');
  }

  /** Save current trust score for crash recovery */
  setLastTrustScore(score: number): void {
    this.store.set('lastTrustScore', score);
  }

  /** Get last known trust score (for crash recovery) */
  getLastTrustScore(): number | null {
    return this.store.get('lastTrustScore');
  }
}
