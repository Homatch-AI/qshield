import { useEffect, useState, useCallback } from 'react';
import { SettingsSection, ToggleSwitch } from './Settings';
import { isIPCAvailable } from '@/lib/mock-data';

interface EmailNotificationConfig {
  enabled: boolean;
  recipientEmail: string;
  events: {
    assetChanges: boolean;
    scoreDrops: boolean;
    spfDkimFailures: boolean;
    dailySummary: boolean;
  };
  scoreThreshold: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  rateLimit: number;
  resendApiKey: string;
}

const DEFAULT_CONFIG: EmailNotificationConfig = {
  enabled: false,
  recipientEmail: '',
  events: { assetChanges: true, scoreDrops: true, spfDkimFailures: true, dailySummary: false },
  scoreThreshold: 40,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  rateLimit: 5,
  resendApiKey: '',
};

function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

export function EmailNotificationSettings() {
  const [config, setConfig] = useState<EmailNotificationConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (loaded) return;
    if (isIPCAvailable()) {
      window.qshield.emailNotify.getConfig().then((cfg) => {
        setConfig(cfg);
        setLoaded(true);
      }).catch(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [loaded]);

  const save = useCallback(async (partial: Partial<EmailNotificationConfig>) => {
    const updated = { ...config, ...partial };
    if (partial.events) {
      updated.events = { ...config.events, ...partial.events };
    }
    setConfig(updated);
    if (isIPCAvailable()) {
      await window.qshield.emailNotify.setConfig(partial).catch(() => {});
    }
  }, [config]);

  const handleTest = async () => {
    setTestStatus('sending');
    setTestError('');
    try {
      if (isIPCAvailable()) {
        const result = await window.qshield.emailNotify.sendTest();
        if (result.sent) {
          setTestStatus('sent');
          setTimeout(() => setTestStatus('idle'), 3000);
        } else {
          setTestStatus('error');
          setTestError(result.error ?? 'Failed to send');
          setTimeout(() => setTestStatus('idle'), 5000);
        }
      } else {
        setTestStatus('sent');
        setTimeout(() => setTestStatus('idle'), 3000);
      }
    } catch {
      setTestStatus('error');
      setTestError('Failed to send test email');
      setTimeout(() => setTestStatus('idle'), 5000);
    }
  };

  const disabled = !config.enabled;

  return (
    <SettingsSection title="Email Notifications" description="Receive email alerts for trust events and daily summaries">
      <div className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-slate-200">Enable Email Notifications</span>
            <p className="text-xs text-slate-500 mt-0.5">Send alerts to your email for important trust events</p>
          </div>
          <ToggleSwitch
            checked={config.enabled}
            onChange={(v) => save({ enabled: v })}
          />
        </div>

        {/* Email + Send Test */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recipient Email</label>
          <div className="mt-1.5 flex gap-2">
            <input
              type="email"
              value={config.recipientEmail}
              onChange={(e) => setConfig({ ...config, recipientEmail: e.target.value })}
              onBlur={() => save({ recipientEmail: config.recipientEmail })}
              placeholder="you@example.com"
              disabled={disabled}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleTest}
              disabled={disabled || testStatus === 'sending' || !config.recipientEmail}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {testStatus === 'sending' ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              ) : null}
              Send Test
            </button>
          </div>
          {testStatus === 'sent' && (
            <p className="text-xs text-emerald-400 mt-1">Test email sent successfully</p>
          )}
          {testStatus === 'error' && (
            <p className="text-xs text-red-400 mt-1">{testError}</p>
          )}
        </div>

        {/* Event checkboxes */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notify On</label>
          <div className="mt-2 space-y-2.5">
            {([
              { key: 'assetChanges' as const, label: 'High-trust asset changes', desc: 'When a monitored file or directory is modified' },
              { key: 'scoreDrops' as const, label: 'Trust score drops', desc: 'When score falls below the configured threshold' },
              { key: 'spfDkimFailures' as const, label: 'SPF/DKIM failures', desc: 'When email authentication checks fail' },
              { key: 'dailySummary' as const, label: 'Daily trust summary', desc: 'A daily digest of your trust score and events' },
            ]).map(({ key, label, desc }) => (
              <label key={key} className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={config.events[key]}
                  onChange={(e) => save({ events: { ...config.events, [key]: e.target.checked } })}
                  disabled={disabled}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/30 focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm text-slate-200">{label}</span>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Score threshold */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Score Drop Threshold</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={config.scoreThreshold}
              onChange={(e) => setConfig({ ...config, scoreThreshold: Number(e.target.value) })}
              onBlur={() => save({ scoreThreshold: config.scoreThreshold })}
              disabled={disabled}
              className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
            />
            <span className="text-xs text-slate-500">Notify when trust score drops below this value</span>
          </div>
        </div>

        {/* Quiet hours */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quiet Hours</label>
          <p className="text-xs text-slate-500 mt-0.5 mb-1.5">Suppress email notifications during this time window</p>
          <div className="flex items-center gap-2">
            <select
              value={config.quietHoursStart}
              onChange={(e) => save({ quietHoursStart: Number(e.target.value) })}
              disabled={disabled}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{formatHour(i)}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">to</span>
            <select
              value={config.quietHoursEnd}
              onChange={(e) => save({ quietHoursEnd: Number(e.target.value) })}
              disabled={disabled}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{formatHour(i)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Rate limit */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rate Limit</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={config.rateLimit}
              onChange={(e) => setConfig({ ...config, rateLimit: Number(e.target.value) })}
              onBlur={() => save({ rateLimit: config.rateLimit })}
              disabled={disabled}
              className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
            />
            <span className="text-xs text-slate-500">emails per hour maximum</span>
          </div>
        </div>

        {/* Advanced */}
        <div className="border-t border-slate-700 pt-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-300 transition-colors"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Advanced
          </button>
          {showAdvanced && (
            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resend API Key</label>
              <p className="text-xs text-slate-500 mt-0.5 mb-1.5">Optional — provide your own Resend API key for email delivery</p>
              <input
                type="password"
                value={config.resendApiKey}
                onChange={(e) => setConfig({ ...config, resendApiKey: e.target.value })}
                onBlur={() => save({ resendApiKey: config.resendApiKey })}
                placeholder="re_..."
                disabled={disabled}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:border-sky-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
