import type { Alert } from '@qshield/core';
import { formatAdapterName } from '@/lib/formatters';

export interface AlertAction {
  label: string;
  /** 'primary' gets sky-blue styling, 'secondary' gets slate styling */
  variant: 'primary' | 'secondary';
  /** Navigation path, or null for dismiss/callback actions */
  navigateTo?: string;
  /** Action type identifier for non-navigation actions */
  actionType?: 'dismiss' | 'accept_changes' | 'generate_report';
}

export interface DescribedAlert {
  title: string;
  description: string;
  actions: AlertAction[];
}

/**
 * Generate a human-readable title, description, and contextual action buttons
 * for an alert based on its source, title, and metadata.
 */
export function describeAlert(alert: Alert): DescribedAlert {
  const sourceName = formatAdapterName(alert.source);
  const meta = alert.sourceMetadata;

  // Trust score dropped
  if (alert.title.toLowerCase().includes('trust score') || alert.title.toLowerCase().includes('threshold')) {
    const scoreMatch = alert.description.match(/(\d+)/);
    const thresholdMatch = alert.description.match(/threshold\s*(?:of\s+)?(\d+)/i);
    const score = scoreMatch ? scoreMatch[1] : '—';
    const threshold = thresholdMatch ? thresholdMatch[1] : '40';

    return {
      title: `Trust score dropped to ${score}`,
      description: `Your trust score fell below the warning threshold of ${threshold}. Recent activity from ${sourceName} may have contributed.`,
      actions: [
        { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
        { label: 'Generate Report', variant: 'secondary', actionType: 'generate_report', navigateTo: '/certificates' },
        { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
      ],
    };
  }

  // File-related alerts (asset changes, exfiltration, access patterns)
  if (alert.source === 'file') {
    const fileName = meta?.fileName ?? 'a monitored file';
    const operation = meta?.operation;
    const filePath = meta?.filePath;

    if (alert.title.toLowerCase().includes('exfiltration') || operation === 'copy-to-external' || operation === 'move-to-usb') {
      return {
        title: `File copied to external storage`,
        description: `"${fileName}" was ${operation === 'move-to-usb' ? 'moved to a USB device' : 'copied to an external location'}${filePath ? ` from ${filePath}` : ''}. This may violate your data protection policy.`,
        actions: [
          { label: 'View Asset', variant: 'primary', navigateTo: '/assets' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    if (alert.title.toLowerCase().includes('policy violation')) {
      return {
        title: `Policy violation: ${fileName}`,
        description: `A data protection policy was triggered when "${fileName}" was ${operation?.replace(/-/g, ' ') ?? 'accessed'}${filePath ? ` in ${filePath}` : ''}.`,
        actions: [
          { label: 'View Asset', variant: 'primary', navigateTo: '/assets' },
          { label: 'Accept Changes', variant: 'secondary', actionType: 'accept_changes' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    // Generic file alert (unusual pattern, outside hours, etc.)
    return {
      title: alert.title.toLowerCase().includes('outside hours')
        ? `File accessed outside working hours`
        : `Unusual file activity detected`,
      description: `${fileName ? `"${fileName}" was involved` : 'Unusual file activity was detected'}${filePath ? ` in ${filePath}` : ''}. ${alert.description}`,
      actions: [
        { label: 'View Asset', variant: 'primary', navigateTo: '/assets' },
        { label: 'Accept Changes', variant: 'secondary', actionType: 'accept_changes' },
        { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
      ],
    };
  }

  // Email alerts (SPF/DKIM, external domain, etc.)
  if (alert.source === 'email') {
    const sender = meta?.sender;
    const subject = meta?.subject;
    const headers = meta?.headers;
    const hasSpfFail = headers?.['X-SPF'] === 'fail' || headers?.['X-SPF'] === 'softfail';
    const hasDkimFail = headers?.['DKIM-Signature'] === 'none' || headers?.['DKIM-Signature'] === 'invalid';

    if (hasSpfFail || hasDkimFail) {
      const failures: string[] = [];
      if (hasSpfFail) failures.push('SPF');
      if (hasDkimFail) failures.push('DKIM');
      return {
        title: `${failures.join(' & ')} verification failed`,
        description: `An email${sender ? ` from ${sender}` : ''}${subject ? ` ("${subject}")` : ''} failed ${failures.join(' and ')} checks. This could indicate a spoofed sender.`,
        actions: [
          { label: 'View Email Details', variant: 'primary', navigateTo: '/vault' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    if (alert.title.toLowerCase().includes('external domain')) {
      return {
        title: 'Communication with external domain',
        description: `An email${sender ? ` from ${sender}` : ''} was flagged because the sender domain is unrecognized.${subject ? ` Subject: "${subject}".` : ''} Review the sender's reputation.`,
        actions: [
          { label: 'View Email Details', variant: 'primary', navigateTo: '/vault' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    return {
      title: alert.title,
      description: `${alert.description}${sender ? ` Sender: ${sender}.` : ''}`,
      actions: [
        { label: 'View Email Details', variant: 'primary', navigateTo: '/vault' },
        { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
      ],
    };
  }

  // Meeting alerts (Zoom/Teams)
  if (alert.source === 'zoom' || alert.source === 'teams') {
    const meetingTitle = meta?.meetingTitle;
    const trigger = meta?.triggerReason;
    const externalCount = meta?.participants?.filter((p) => !p.endsWith('@company.com')).length ?? 0;

    if (alert.title.toLowerCase().includes('screen sharing') || trigger?.toLowerCase().includes('screen share')) {
      return {
        title: `Screen shared with unverified participant`,
        description: `During "${meetingTitle ?? 'a meeting'}", a screen share was started while ${externalCount} external participant${externalCount !== 1 ? 's were' : ' was'} present.${trigger ? ` ${trigger}.` : ''}`,
        actions: [
          { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    if (alert.title.toLowerCase().includes('unverified') || trigger?.toLowerCase().includes('unverified')) {
      return {
        title: `Unverified participant in meeting`,
        description: `An unverified participant joined "${meetingTitle ?? 'a meeting'}".${externalCount > 0 ? ` ${externalCount} external participant${externalCount !== 1 ? 's' : ''} detected.` : ''}`,
        actions: [
          { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    return {
      title: alert.title,
      description: `${alert.description}${meetingTitle ? ` Meeting: "${meetingTitle}".` : ''}`,
      actions: [
        { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
        { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
      ],
    };
  }

  // API alerts
  if (alert.source === 'api') {
    const endpoint = meta?.endpoint;
    const method = meta?.method;
    const statusCode = meta?.statusCode;
    const policy = meta?.policyViolated;

    if (alert.title.toLowerCase().includes('authentication') || statusCode === 401 || statusCode === 403) {
      return {
        title: 'Failed authentication attempt blocked',
        description: `A ${method ?? ''} request to ${endpoint ?? 'an API endpoint'} returned ${statusCode ?? 'an error'}. ${policy ? `Policy violated: ${policy.replace(/-/g, ' ')}.` : alert.description}`,
        actions: [
          { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    if (statusCode === 429 || alert.title.toLowerCase().includes('anomalous') || alert.title.toLowerCase().includes('rate')) {
      return {
        title: 'Unusual API request volume',
        description: `Request volume to ${endpoint ?? 'an API endpoint'} exceeded normal levels. ${policy ? `Policy: ${policy.replace(/-/g, ' ')}.` : 'Possible automated access.'}`,
        actions: [
          { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    return {
      title: alert.title,
      description: `${alert.description}${endpoint ? ` Endpoint: ${endpoint}.` : ''}`,
      actions: [
        { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
        { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
      ],
    };
  }

  // Crypto alerts
  if (alert.source === 'crypto') {
    const wallet = meta?.walletAddress;
    const chain = meta?.chain;
    const risk = meta?.riskLevel;

    if (alert.title.toLowerCase().includes('clipboard') || alert.description.toLowerCase().includes('clipboard')) {
      return {
        title: 'Clipboard hijack attempt detected',
        description: `A potential clipboard hijack was detected${wallet ? ` targeting address ${wallet.slice(0, 10)}...` : ''}. Your copied wallet address may have been modified.`,
        actions: [
          { label: 'View Activity', variant: 'primary', navigateTo: '/crypto' },
          { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
        ],
      };
    }

    return {
      title: alert.title,
      description: `${alert.description}${chain ? ` Chain: ${chain}.` : ''}${risk ? ` Risk: ${risk}.` : ''}`,
      actions: [
        { label: 'View Activity', variant: 'primary', navigateTo: '/crypto' },
        { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
      ],
    };
  }

  // Fallback: return original alert data with generic actions
  return {
    title: alert.title,
    description: `${alert.description} Source: ${sourceName}.`,
    actions: [
      { label: 'View Activity', variant: 'primary', navigateTo: '/timeline' },
      { label: 'Dismiss', variant: 'secondary', actionType: 'dismiss' },
    ],
  };
}
