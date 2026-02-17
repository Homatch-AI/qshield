import type { Alert } from '@qshield/core';

export interface GroupedAlert {
  id: string;
  count: number;
  alerts: Alert[];
  summary: string;
  severity: Alert['severity'];
  latestTimestamp: string;
  source: string;
}

export function isGroupedAlert(item: Alert | GroupedAlert): item is GroupedAlert {
  return 'count' in item && 'alerts' in item;
}

const GROUPING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function buildSummary(alerts: Alert[], source: string): string {
  const first = alerts[0];
  // Try to find a common pattern in the titles
  if (source === 'file') {
    const fileOps = alerts.filter((a) => a.sourceMetadata?.fileName);
    if (fileOps.length > 1) {
      const dir = fileOps[0].sourceMetadata?.filePath ?? 'a monitored directory';
      return `${fileOps.length} file changes detected in ${dir}`;
    }
    return `${alerts.length} file activity alerts`;
  }
  if (source === 'email') {
    return `${alerts.length} email security alerts`;
  }
  if (source === 'zoom' || source === 'teams') {
    return `${alerts.length} meeting security alerts`;
  }
  if (source === 'api') {
    return `${alerts.length} API security alerts`;
  }
  if (source === 'crypto') {
    return `${alerts.length} crypto security alerts`;
  }
  // Fallback: use first alert's title as basis
  return `${alerts.length} related alerts: ${first.title}`;
}

/**
 * Group alerts that share the same source adapter and severity
 * and occurred within 5 minutes of each other.
 * Singles stay as individual Alert objects.
 */
export function groupAlerts(alerts: Alert[]): (Alert | GroupedAlert)[] {
  if (alerts.length === 0) return [];

  // Sort by timestamp descending (newest first) for consistent grouping
  const sorted = [...alerts].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const used = new Set<string>();
  const result: (Alert | GroupedAlert)[] = [];

  for (const alert of sorted) {
    if (used.has(alert.id)) continue;

    // Find alerts that match source + severity and are within the time window
    const group: Alert[] = [alert];
    used.add(alert.id);
    const alertTime = new Date(alert.timestamp).getTime();

    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      if (candidate.source !== alert.source) continue;
      if (candidate.severity !== alert.severity) continue;

      const candidateTime = new Date(candidate.timestamp).getTime();
      if (Math.abs(candidateTime - alertTime) <= GROUPING_WINDOW_MS) {
        group.push(candidate);
        used.add(candidate.id);
      }
    }

    if (group.length === 1) {
      result.push(alert);
    } else {
      // Sort group by timestamp descending
      group.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      result.push({
        id: `group-${alert.id}`,
        count: group.length,
        alerts: group,
        summary: buildSummary(group, alert.source),
        severity: alert.severity,
        latestTimestamp: group[0].timestamp,
        source: alert.source,
      });
    }
  }

  return result;
}
