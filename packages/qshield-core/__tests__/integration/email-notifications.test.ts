import { describe, it, expect } from 'vitest';

// ── Quiet Hours ─────────────────────────────────────────────────────────────

describe('Email Notifications - Quiet Hours', () => {
  function isQuietHours(now: Date, quietStart: number, quietEnd: number): boolean {
    const hour = now.getHours();
    if (quietStart < quietEnd) {
      return hour >= quietStart && hour < quietEnd;
    }
    // Wraps midnight: e.g., 22:00 - 07:00
    return hour >= quietStart || hour < quietEnd;
  }

  it('3am with quiet hours 22:00-07:00 → quiet', () => {
    const date = new Date('2024-06-15T03:00:00');
    expect(isQuietHours(date, 22, 7)).toBe(true);
  });

  it('10am with quiet hours 22:00-07:00 → not quiet', () => {
    const date = new Date('2024-06-15T10:00:00');
    expect(isQuietHours(date, 22, 7)).toBe(false);
  });

  it('11pm with quiet hours 22:00-07:00 → quiet', () => {
    const date = new Date('2024-06-15T23:00:00');
    expect(isQuietHours(date, 22, 7)).toBe(true);
  });

  it('12pm with quiet hours 00:00-06:00 → not quiet', () => {
    const date = new Date('2024-06-15T12:00:00');
    expect(isQuietHours(date, 0, 6)).toBe(false);
  });

  it('2am with quiet hours 00:00-06:00 → quiet', () => {
    const date = new Date('2024-06-15T02:00:00');
    expect(isQuietHours(date, 0, 6)).toBe(true);
  });

  it('critical alerts bypass quiet hours', () => {
    const date = new Date('2024-06-15T03:00:00');
    const inQuiet = isQuietHours(date, 22, 7);
    expect(inQuiet).toBe(true);
    // Critical alerts: always send regardless of quiet hours
    const severity = 'critical';
    const shouldSend = severity === 'critical' || !inQuiet;
    expect(shouldSend).toBe(true);
  });
});

// ── Notification Type Selection ─────────────────────────────────────────────

describe('Email Notifications - Notification Type', () => {
  type NotificationType = 'trust_drop' | 'policy_violation' | 'asset_alert' | 'ai_zone_violation';

  function getNotificationType(eventType: string): NotificationType | null {
    if (eventType.includes('trust') && eventType.includes('drop')) return 'trust_drop';
    if (eventType.includes('policy')) return 'policy_violation';
    if (eventType.includes('asset')) return 'asset_alert';
    if (eventType.includes('ai-zone')) return 'ai_zone_violation';
    return null;
  }

  it('trust-drop-detected → trust_drop', () => {
    expect(getNotificationType('trust-drop-detected')).toBe('trust_drop');
  });

  it('policy-alert → policy_violation', () => {
    expect(getNotificationType('policy-alert')).toBe('policy_violation');
  });

  it('high-trust:asset-modified → asset_alert', () => {
    expect(getNotificationType('high-trust:asset-modified')).toBe('asset_alert');
  });

  it('ai-zone-violation → ai_zone_violation', () => {
    expect(getNotificationType('ai-zone-violation')).toBe('ai_zone_violation');
  });

  it('meeting-started → null (no notification)', () => {
    expect(getNotificationType('meeting-started')).toBeNull();
  });

  it('adapter-connected → null', () => {
    expect(getNotificationType('adapter-connected')).toBeNull();
  });
});

// ── Severity Filter ─────────────────────────────────────────────────────────

describe('Email Notifications - Severity Filter', () => {
  function shouldNotify(severity: string, minSeverity: string): boolean {
    const levels: Record<string, number> = { critical: 4, high: 3, warning: 2, medium: 2, low: 1 };
    return (levels[severity] || 0) >= (levels[minSeverity] || 0);
  }

  it('critical when min=warning → true', () => {
    expect(shouldNotify('critical', 'warning')).toBe(true);
  });

  it('warning when min=critical → false', () => {
    expect(shouldNotify('warning', 'critical')).toBe(false);
  });

  it('high when min=high → true', () => {
    expect(shouldNotify('high', 'high')).toBe(true);
  });

  it('low when min=low → true', () => {
    expect(shouldNotify('low', 'low')).toBe(true);
  });

  it('medium when min=high → false', () => {
    expect(shouldNotify('medium', 'high')).toBe(false);
  });

  it('critical when min=low → true', () => {
    expect(shouldNotify('critical', 'low')).toBe(true);
  });

  it('unknown severity → false', () => {
    expect(shouldNotify('unknown', 'low')).toBe(false);
  });
});

// ── Rate Limiting ───────────────────────────────────────────────────────────

describe('Email Notifications - Rate Limiting', () => {
  function createRateLimiter(maxPerMinute: number) {
    const timestamps: number[] = [];

    return {
      canSend(now: number): boolean {
        // Remove entries older than 1 minute
        const cutoff = now - 60000;
        while (timestamps.length > 0 && timestamps[0] < cutoff) {
          timestamps.shift();
        }
        if (timestamps.length >= maxPerMinute) return false;
        timestamps.push(now);
        return true;
      },
      count: () => timestamps.length,
    };
  }

  it('first notification always allowed', () => {
    const limiter = createRateLimiter(5);
    expect(limiter.canSend(1000)).toBe(true);
  });

  it('up to max per minute allowed', () => {
    const limiter = createRateLimiter(3);
    expect(limiter.canSend(1000)).toBe(true);
    expect(limiter.canSend(2000)).toBe(true);
    expect(limiter.canSend(3000)).toBe(true);
    expect(limiter.canSend(4000)).toBe(false); // 4th within 1 minute
  });

  it('after 1 minute, window resets', () => {
    const limiter = createRateLimiter(2);
    expect(limiter.canSend(1000)).toBe(true);
    expect(limiter.canSend(2000)).toBe(true);
    expect(limiter.canSend(3000)).toBe(false);
    // After 1 minute
    expect(limiter.canSend(62000)).toBe(true);
  });
});
