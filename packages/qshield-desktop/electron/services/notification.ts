import log from 'electron-log';
import { Notification, BrowserWindow } from 'electron';
import type { Alert } from '@qshield/core';

/** Severity levels ranked from lowest to highest */
const SEVERITY_RANK: Record<Alert['severity'], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Stored notification entry with metadata */
export interface NotificationEntry {
  /** Unique notification ID */
  id: string;
  /** The original alert */
  alert: Alert;
  /** When the notification was shown */
  shownAt: string;
  /** Whether the user clicked on it */
  clicked: boolean;
  /** Target page to navigate to on click */
  targetPage: string;
}

/**
 * OS-native notification service for QShield alerts.
 *
 * Uses the Electron Notification API to display desktop notifications
 * for trust-related alerts. Features include:
 * - Severity-based filtering with configurable minimum threshold
 * - In-app notification queue for UI consumption
 * - Notification history (last 100 notifications, persistable to electron-store)
 * - Rate limiting: max 1 notification per 5 seconds
 * - Click-to-navigate: clicking opens the relevant page in the main window
 */
export class NotificationService {
  private minSeverity: Alert['severity'];
  private notificationQueue: NotificationEntry[] = [];
  private lastNotificationTime = 0;

  /** Maximum number of notifications to retain in history */
  private static readonly MAX_HISTORY = 100;

  /** Minimum interval between notifications in milliseconds */
  private static readonly RATE_LIMIT_MS = 5000;

  /**
   * Create a new NotificationService.
   * @param minSeverity - minimum severity level to show notifications (default: 'medium')
   */
  constructor(minSeverity: Alert['severity'] = 'medium') {
    this.minSeverity = minSeverity;
    log.info(`[NotificationService] Initialized with min severity: ${minSeverity}`);
  }

  /**
   * Display a native OS notification for the given alert.
   * Notification is suppressed if:
   * - Alert severity is below the configured minimum threshold
   * - Rate limit would be exceeded (1 per 5 seconds)
   * - Notifications are not supported on the platform
   *
   * The notification is always added to the in-app queue regardless
   * of whether an OS notification was shown.
   *
   * @param alert - the alert to notify about
   * @param targetPage - page to navigate to on click (default: '/alerts')
   */
  notify(alert: Alert, targetPage = '/alerts'): void {
    // Always add to in-app queue
    const entry: NotificationEntry = {
      id: alert.id,
      alert,
      shownAt: new Date().toISOString(),
      clicked: false,
      targetPage,
    };
    this.addToQueue(entry);

    // Check if notifications are supported
    if (!this.isSupported()) {
      log.warn('[NotificationService] Notifications not supported on this platform');
      return;
    }

    // Check minimum severity
    if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[this.minSeverity]) {
      log.debug(
        `[NotificationService] OS notification suppressed (severity ${alert.severity} < min ${this.minSeverity})`,
      );
      return;
    }

    // Check rate limit
    const now = Date.now();
    if (now - this.lastNotificationTime < NotificationService.RATE_LIMIT_MS) {
      log.debug('[NotificationService] OS notification rate-limited');
      return;
    }

    this.lastNotificationTime = now;

    const urgency = this.getUrgency(alert.severity);
    const icon = this.getIconForSeverity(alert.severity);

    const notification = new Notification({
      title: `QShield ${alert.severity.toUpperCase()}: ${alert.title}`,
      body: alert.description,
      icon,
      urgency,
      silent: alert.severity === 'low',
    });

    notification.on('click', () => {
      log.info(`[NotificationService] Notification clicked: ${alert.id}`);
      entry.clicked = true;
      this.focusMainWindow(targetPage);
    });

    notification.on('close', () => {
      log.debug(`[NotificationService] Notification closed: ${alert.id}`);
    });

    notification.show();
    log.info(
      `[NotificationService] Notification shown: [${alert.severity}] ${alert.title}`,
    );
  }

  /**
   * Get the in-app notification queue ordered by most recent first.
   * @returns array of notification entries
   */
  getQueue(): NotificationEntry[] {
    return [...this.notificationQueue];
  }

  /**
   * Get unread (not clicked) notifications from the queue.
   * @returns array of unread notification entries
   */
  getUnread(): NotificationEntry[] {
    return this.notificationQueue.filter((n) => !n.clicked);
  }

  /**
   * Get the count of unread notifications.
   * @returns number of unread notifications
   */
  getUnreadCount(): number {
    return this.notificationQueue.filter((n) => !n.clicked).length;
  }

  /**
   * Mark a notification as clicked/read.
   * @param id - notification ID to mark
   * @returns true if the notification was found and marked
   */
  markAsRead(id: string): boolean {
    const entry = this.notificationQueue.find((n) => n.id === id);
    if (entry) {
      entry.clicked = true;
      return true;
    }
    return false;
  }

  /**
   * Mark all notifications as read.
   */
  markAllAsRead(): void {
    for (const entry of this.notificationQueue) {
      entry.clicked = true;
    }
    log.info('[NotificationService] All notifications marked as read');
  }

  /**
   * Dismiss (remove) a notification from the queue.
   * @param id - notification ID to dismiss
   * @returns true if the notification was found and removed
   */
  dismiss(id: string): boolean {
    const index = this.notificationQueue.findIndex((n) => n.id === id);
    if (index >= 0) {
      this.notificationQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all notifications from the queue.
   */
  clearAll(): void {
    this.notificationQueue = [];
    log.info('[NotificationService] Notification queue cleared');
  }

  /**
   * Export the notification history for persistence.
   * Returns the last MAX_HISTORY notifications serialized for storage.
   * @returns serializable notification entries
   */
  exportHistory(): NotificationEntry[] {
    return [...this.notificationQueue];
  }

  /**
   * Import notification history from persisted storage.
   * @param entries - previously exported notification entries
   */
  importHistory(entries: NotificationEntry[]): void {
    this.notificationQueue = entries.slice(-NotificationService.MAX_HISTORY);
    log.info(`[NotificationService] Imported ${this.notificationQueue.length} notifications`);
  }

  /**
   * Check whether the Electron Notification API is supported
   * on the current platform.
   * @returns true if notifications are supported
   */
  isSupported(): boolean {
    return Notification.isSupported();
  }

  /**
   * Update the minimum severity threshold for OS notifications.
   * @param severity - new minimum severity level
   */
  setMinSeverity(severity: Alert['severity']): void {
    this.minSeverity = severity;
    log.info(`[NotificationService] Min severity updated to: ${severity}`);
  }

  /**
   * Get the current minimum severity setting.
   * @returns current minimum severity level
   */
  getMinSeverity(): Alert['severity'] {
    return this.minSeverity;
  }

  /**
   * Add a notification entry to the queue, trimming oldest entries
   * if the queue exceeds MAX_HISTORY.
   * @param entry - the notification entry to add
   */
  private addToQueue(entry: NotificationEntry): void {
    this.notificationQueue.unshift(entry); // newest first
    if (this.notificationQueue.length > NotificationService.MAX_HISTORY) {
      this.notificationQueue = this.notificationQueue.slice(0, NotificationService.MAX_HISTORY);
    }
  }

  /**
   * Map alert severity to Electron notification urgency.
   * @param severity - the alert severity
   * @returns Electron urgency level
   */
  private getUrgency(severity: Alert['severity']): 'normal' | 'critical' | 'low' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'critical';
      case 'medium':
        return 'normal';
      case 'low':
        return 'low';
      default:
        return 'normal';
    }
  }

  /**
   * Get the notification icon path based on severity.
   * @param severity - the alert severity
   * @returns icon file path or undefined
   */
  private getIconForSeverity(severity: Alert['severity']): string | undefined {
    const iconMap: Record<Alert['severity'], string> = {
      critical: 'resources/icons/alert-critical.png',
      high: 'resources/icons/alert-high.png',
      medium: 'resources/icons/alert-medium.png',
      low: 'resources/icons/alert-low.png',
    };
    return iconMap[severity];
  }

  /**
   * Find and focus the main application window, optionally navigating
   * to a specific page.
   * @param targetPage - hash route to navigate to (e.g., '/alerts')
   */
  private focusMainWindow(targetPage?: string): void {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find((w) => !w.isDestroyed());

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();

      if (targetPage) {
        mainWindow.webContents.send('navigate', targetPage);
      }

      log.debug('[NotificationService] Main window focused');
    } else {
      log.warn('[NotificationService] No main window found to focus');
    }
  }
}
