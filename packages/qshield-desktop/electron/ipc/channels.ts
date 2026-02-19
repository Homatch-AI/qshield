/**
 * IPC channel constants for communication between main and renderer processes.
 * All IPC communication must go through these typed channel constants.
 * Never use raw strings for IPC channels — always reference this module.
 */

/** Request-response channels used with ipcRenderer.invoke / ipcMain.handle */
export const IPC_CHANNELS = {
  // ── Trust ──────────────────────────────────────────────────────────────
  /** Retrieve current trust state (score, level, signals) */
  TRUST_GET_STATE: 'trust:get-state',
  /** Begin receiving trust state push updates via IPC_EVENTS.TRUST_STATE_UPDATED */
  TRUST_SUBSCRIBE: 'trust:subscribe',
  /** Stop receiving trust state push updates */
  TRUST_UNSUBSCRIBE: 'trust:unsubscribe',

  // ── Evidence ───────────────────────────────────────────────────────────
  /** List evidence records with pagination and optional sorting */
  EVIDENCE_LIST: 'evidence:list',
  /** Get a single evidence record by UUID */
  EVIDENCE_GET: 'evidence:get',
  /** Verify integrity of an evidence record's hash chain */
  EVIDENCE_VERIFY: 'evidence:verify',
  /** Full-text search across evidence records */
  EVIDENCE_SEARCH: 'evidence:search',
  /** Export selected evidence records (rate-limited: 1/min) */
  EVIDENCE_EXPORT: 'evidence:export',

  // ── Certificates ───────────────────────────────────────────────────────
  /** Generate a trust certificate for a session (rate-limited: 1/min) */
  CERT_GENERATE: 'cert:generate',
  /** List all generated certificates */
  CERT_LIST: 'cert:list',
  /** Export a certificate as PDF with save dialog */
  CERT_EXPORT_PDF: 'cert:export-pdf',
  /** Open a certificate PDF in the system default viewer */
  CERT_REVIEW_PDF: 'cert:review-pdf',

  // ── Gateway ────────────────────────────────────────────────────────────
  /** Get gateway connection status */
  GATEWAY_STATUS: 'gateway:status',
  /** Connect to a QShield Gateway by URL */
  GATEWAY_CONNECT: 'gateway:connect',
  /** Disconnect from the current gateway */
  GATEWAY_DISCONNECT: 'gateway:disconnect',

  // ── Alerts ─────────────────────────────────────────────────────────────
  /** List all active alerts */
  ALERT_LIST: 'alert:list',
  /** Dismiss an alert by UUID */
  ALERT_DISMISS: 'alert:dismiss',
  /** Subscribe to real-time alert push events */
  ALERT_SUBSCRIBE: 'alert:subscribe',

  // ── Policy ─────────────────────────────────────────────────────────────
  /** Get the current policy configuration */
  POLICY_GET: 'policy:get',
  /** Update the policy configuration */
  POLICY_UPDATE: 'policy:update',

  // ── Config ─────────────────────────────────────────────────────────────
  /** Read a config value by dot-notation key */
  CONFIG_GET: 'config:get',
  /** Read all config values */
  CONFIG_GET_ALL: 'config:get-all',
  /** Write a config value by dot-notation key (rate-limited: 10/min) */
  CONFIG_SET: 'config:set',

  // ── Adapters ───────────────────────────────────────────────────────────
  /** Get status of all monitoring adapters */
  ADAPTER_STATUS: 'adapter:status',
  /** Enable a monitoring adapter by ID */
  ADAPTER_ENABLE: 'adapter:enable',
  /** Disable a monitoring adapter by ID */
  ADAPTER_DISABLE: 'adapter:disable',

  // ── Signature ─────────────────────────────────────────────────────────
  /** Generate email signature HTML with current trust score */
  SIGNATURE_GENERATE: 'signature:generate',
  /** Generate and copy email signature HTML to system clipboard */
  SIGNATURE_COPY: 'signature:copy',
  /** Get saved signature preferences */
  SIGNATURE_GET_CONFIG: 'signature:get-config',
  /** Save signature preferences */
  SIGNATURE_SET_CONFIG: 'signature:set-config',

  // ── Verification ────────────────────────────────────────────────────────
  /** Get signature verification stats (total generated, clicks, CTR) */
  VERIFY_GET_STATS: 'verify:get-stats',

  // ── Crypto ──────────────────────────────────────────────────────────────
  /** Get crypto security overview status */
  CRYPTO_GET_STATUS: 'crypto:get-status',
  /** Verify a crypto address format, checksum, and scam database */
  CRYPTO_VERIFY_ADDRESS: 'crypto:verify-address',
  /** Verify a transaction hash format */
  CRYPTO_VERIFY_TRANSACTION: 'crypto:verify-transaction',
  /** Get the trusted address book */
  CRYPTO_GET_ADDRESS_BOOK: 'crypto:get-address-book',
  /** Add an address to the trusted address book */
  CRYPTO_ADD_TRUSTED_ADDRESS: 'crypto:add-trusted-address',
  /** Remove an address from the trusted address book */
  CRYPTO_REMOVE_TRUSTED_ADDRESS: 'crypto:remove-trusted-address',
  /** Get crypto-specific security alerts */
  CRYPTO_GET_ALERTS: 'crypto:get-alerts',
  /** Get clipboard guard status */
  CRYPTO_CLIPBOARD_STATUS: 'crypto:clipboard-status',

  // ── License ──────────────────────────────────────────────────────────
  /** Get the current license info */
  LICENSE_GET: 'license:get',
  /** Activate a license key */
  LICENSE_ACTIVATE: 'license:activate',
  /** Deactivate the current license key */
  LICENSE_DEACTIVATE: 'license:deactivate',
  /** Generate a test license key (dev only) */
  LICENSE_GENERATE_TEST: 'license:generate-test',
  /** Check whether a specific feature is available */
  FEATURE_CHECK: 'feature:check',
  /** Get all feature flags for the current license */
  FEATURE_FLAGS: 'feature:flags',

  // ── App ────────────────────────────────────────────────────────────────
  /** Get the application version string */
  APP_VERSION: 'app:version',
  /** Request graceful application shutdown */
  APP_QUIT: 'app:quit',
  /** Focus the main window (used by shield overlay double-click) */
  APP_FOCUS_MAIN: 'app:focus-main',
  /** Toggle the main window visibility (used by shield overlay double-click) */
  APP_TOGGLE_MAIN: 'app:toggle-main-window',
  /** Toggle the shield overlay window on/off */
  APP_TOGGLE_SHIELD: 'app:toggle-shield-overlay',
  /** Move the shield overlay to a new screen corner */
  SHIELD_SET_POSITION: 'shield:set-position',
  /** Set the shield overlay opacity (0.1–1.0) */
  SHIELD_SET_OPACITY: 'shield:set-opacity',
  /** Focus the main window and navigate to the alerts page */
  APP_SHOW_ALERTS: 'app:show-alerts',
  /** Open a URL in the system default browser */
  APP_OPEN_EXTERNAL: 'app:open-external',
  // ── Local API ─────────────────────────────────────────────────────────
  /** Get local API server info (port, token, running status) */
  API_GET_INFO: 'api:get-info',
  /** Regenerate the local API token */
  API_REGENERATE_TOKEN: 'api:regenerate-token',

  // ── Secure Messages ─────────────────────────────────────────────────
  /** Create a new encrypted secure message */
  SECURE_MSG_CREATE: 'secure-msg:create',
  /** List all secure messages */
  SECURE_MSG_LIST: 'secure-msg:list',
  /** Get a secure message by ID */
  SECURE_MSG_GET: 'secure-msg:get',
  /** Destroy a secure message */
  SECURE_MSG_DESTROY: 'secure-msg:destroy',
  /** Get the access log for a secure message */
  SECURE_MSG_ACCESS_LOG: 'secure-msg:access-log',
  /** Copy the share link for a secure message to clipboard */
  SECURE_MSG_COPY_LINK: 'secure-msg:copy-link',

  // ── Gmail ──────────────────────────────────────────────────────
  /** Start OAuth flow to connect Gmail */
  GMAIL_CONNECT: 'gmail:connect',
  /** Disconnect Gmail and revoke tokens */
  GMAIL_DISCONNECT: 'gmail:disconnect',
  /** Get Gmail connection status */
  GMAIL_STATUS: 'gmail:status',

  // ── Email Notifications ──────────────────────────────────────────
  /** Get email notification configuration */
  EMAIL_NOTIFY_GET_CONFIG: 'email-notify:config:get',
  /** Update email notification configuration */
  EMAIL_NOTIFY_SET_CONFIG: 'email-notify:config:set',
  /** Send a test email notification */
  EMAIL_NOTIFY_TEST: 'email-notify:test',

  // ── File Watcher ──────────────────────────────────────────────
  /** Configure file watcher adapter */
  FILE_WATCHER_CONFIGURE: 'file-watcher:configure',
  /** Get current watched paths */
  FILE_WATCHER_PATHS: 'file-watcher:paths',

  // ── Secure Files ──────────────────────────────────────────────
  /** Upload and encrypt a new secure file */
  SECURE_FILE_UPLOAD: 'secure-file:upload',
  /** List all secure files */
  SECURE_FILE_LIST: 'secure-file:list',
  /** Get a secure file by ID */
  SECURE_FILE_GET: 'secure-file:get',
  /** Destroy a secure file */
  SECURE_FILE_DESTROY: 'secure-file:destroy',

  // ── High-Trust Assets ──────────────────────────────────────────
  /** List all registered high-trust assets */
  ASSET_LIST: 'asset:list',
  /** Add a new high-trust asset (file or directory) */
  ASSET_ADD: 'asset:add',
  /** Remove a high-trust asset by ID */
  ASSET_REMOVE: 'asset:remove',
  /** Get a single high-trust asset by ID */
  ASSET_GET: 'asset:get',
  /** Verify an asset's hash integrity */
  ASSET_VERIFY: 'asset:verify',
  /** Accept current state of an asset as verified */
  ASSET_ACCEPT: 'asset:accept',
  /** Update sensitivity level of an asset */
  ASSET_UPDATE_SENSITIVITY: 'asset:update-sensitivity',
  /** Enable or disable monitoring for an asset */
  ASSET_ENABLE: 'asset:enable',
  /** Get aggregate asset monitoring stats */
  ASSET_STATS: 'asset:stats',
  /** Get the change log for a specific asset */
  ASSET_CHANGE_LOG: 'asset:change-log',
  /** Open a native file/folder picker dialog */
  ASSET_BROWSE: 'asset:browse',
  /** Pause monitoring for an asset temporarily */
  ASSET_PAUSE: 'asset:pause',

  // ── Shell / Investigation ───────────────────────────────────────
  /** Open a file or folder in the system file manager */
  SHELL_SHOW_IN_FOLDER: 'shell:show-in-folder',
  /** Check what processes have a file/folder open */
  INVESTIGATE_CHECK_PROCESSES: 'investigate:check-processes',

  // ── Trust Profile ──────────────────────────────────────────────
  /** Get lifetime trust profile stats (grades, streaks, milestones) */
  TRUST_PROFILE: 'trust:profile',
  /** Get score history snapshots for the last N days */
  TRUST_HISTORY: 'trust:history',
  /** Get all earned trust milestones */
  TRUST_MILESTONES: 'trust:milestones',
  /** Get daily summaries for a date range */
  TRUST_DAILY_SUMMARIES: 'trust:daily-summaries',

  // ── Trust Reports ──────────────────────────────────────────────
  /** Generate a trust report (snapshot, period, or asset) */
  REPORT_GENERATE: 'report:generate',
  /** List all generated trust reports */
  REPORT_LIST: 'report:list',
  /** Export a trust report as PDF with save dialog */
  REPORT_EXPORT_PDF: 'report:export-pdf',
  /** Open a trust report PDF in the system viewer */
  REPORT_REVIEW_PDF: 'report:review-pdf',
  /** Get a single trust report by ID */
  REPORT_GET: 'report:get',

  // ── Security ──────────────────────────────────────────────────
  /** Get key management status (initialized, backend type) */
  SECURITY_KEY_STATUS: 'security:key-status',

  // ── Trust History (internal) ──────────────────────────────────
  /** Get lifetime trust stats for the Trust Profile page */
  TRUST_HISTORY_LIFETIME: 'trust-history:lifetime',
  /** Get a single daily summary by date (YYYY-MM-DD) */
  TRUST_HISTORY_DAILY: 'trust-history:daily',
  /** Get daily summaries for a date range */
  TRUST_HISTORY_DAILY_RANGE: 'trust-history:daily-range',
  /** Get score history snapshots for the last N days */
  TRUST_HISTORY_SCORE_HISTORY: 'trust-history:score-history',
  /** Get all earned milestones */
  TRUST_HISTORY_MILESTONES: 'trust-history:milestones',
  /** Get the trust trend over the last N days */
  TRUST_HISTORY_TREND: 'trust-history:trend',
} as const;

/** Union type of all valid IPC channel strings */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * Push-event channels sent from main process to renderer.
 * These use webContents.send() and are listened to via ipcRenderer.on().
 */
export const IPC_EVENTS = {
  /** Fired when the trust state changes (score, level, or signals updated) */
  TRUST_STATE_UPDATED: 'event:trust-state-updated',
  /** Fired when a new alert is received */
  ALERT_RECEIVED: 'event:alert-received',
  /** Fired when an adapter's connection status changes */
  ADAPTER_STATUS_CHANGED: 'event:adapter-status-changed',
  /** Fired when gateway connection state changes */
  GATEWAY_CONNECTION_CHANGED: 'event:gateway-connection-changed',
  /** Fired when a high-trust asset changes (file modified, deleted, etc.) */
  ASSET_CHANGED: 'event:asset-changed',
  /** Fired when an asset's trust state is updated (verified → changed, etc.) */
  ASSET_STATE_UPDATED: 'event:asset-state-updated',
} as const;

/** Union type of all valid IPC event strings */
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
