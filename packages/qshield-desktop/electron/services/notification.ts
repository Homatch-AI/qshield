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

/**
 * OS-native notification service for QShield alerts.
 * Uses the Electron Notification API to display desktop notifications
 * for trust-related alerts. Respects minimum severity configuration
 * and focuses the main window when a notification is clicked.
 */
export class NotificationService {
  private minSeverity: Alert['severity'];

  constructor(minSeverity: Alert['severity'] = 'medium') {
    this.minSeverity = minSeverity;
    log.info(`[NotificationService] Initialized with min severity: ${minSeverity}`);
  }

  /**
   * Display a native OS notification for the given alert.
   * Notification is suppressed if the alert severity is below the
   * configured minimum threshold.
   */
  notify(alert: Alert): void {
    // Check if notifications are supported
    if (!this.isSupported()) {
      log.warn('[NotificationService] Notifications not supported on this platform');
      return;
    }

    // Check minimum severity
    if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[this.minSeverity]) {
      log.debug(
        `[NotificationService] Alert suppressed (severity ${alert.severity} < min ${this.minSeverity})`,
      );
      return;
    }

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
      this.focusMainWindow();
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
   * Check whether the Electron Notification API is supported
   * on the current platform.
   */
  isSupported(): boolean {
    return Notification.isSupported();
  }

  /**
   * Update the minimum severity threshold for notifications.
   */
  setMinSeverity(severity: Alert['severity']): void {
    this.minSeverity = severity;
    log.info(`[NotificationService] Min severity updated to: ${severity}`);
  }

  /**
   * Get the current minimum severity setting.
   */
  getMinSeverity(): Alert['severity'] {
    return this.minSeverity;
  }

  /**
   * Map alert severity to Electron notification urgency.
   */
  private getUrgency(severity: Alert['severity']): 'normal' | 'critical' | 'low' {
    switch (severity) {
      case 'critical':
        return 'critical';
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
   * Falls back to the default app icon if severity-specific icons
   * are not available.
   */
  private getIconForSeverity(severity: Alert['severity']): string | undefined {
    // These paths are relative to the resources directory.
    // In production, icons would be bundled in the app resources.
    const iconMap: Record<Alert['severity'], string> = {
      critical: 'resources/icons/alert-critical.png',
      high: 'resources/icons/alert-high.png',
      medium: 'resources/icons/alert-medium.png',
      low: 'resources/icons/alert-low.png',
    };

    return iconMap[severity];
  }

  /**
   * Find and focus the main application window.
   * Called when a notification is clicked to bring the app to the foreground.
   */
  private focusMainWindow(): void {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find((w) => !w.isDestroyed());

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      log.debug('[NotificationService] Main window focused');
    } else {
      log.warn('[NotificationService] No main window found to focus');
    }
  }
}
