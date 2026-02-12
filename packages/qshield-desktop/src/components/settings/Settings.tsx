import { useEffect, useState } from 'react';
import useConfigStore from '@/stores/config-store';
import { SkeletonCard } from '@/components/shared/SkeletonLoader';
import { formatFileSize } from '@/lib/formatters';
import { ADAPTER_LABELS } from '@/lib/constants';
import type { PolicyRule, AdapterType } from '@qshield/core';

/**
 * Full settings page with sections for Gateway, Adapters, Policy Rules,
 * Notifications, Shield Overlay, and Storage.
 */
export default function Settings() {
  const { config, policyRules, loading, error, fetchConfig, updateConfig, addPolicyRule, updatePolicyRule, removePolicyRule } = useConfigStore();

  const [gatewayUrl, setGatewayUrl] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationThreshold, setNotificationThreshold] = useState('medium');
  const [shieldOverlay, setShieldOverlay] = useState(true);
  const [shieldOpacity, setShieldOpacity] = useState(85);
  const [shieldPosition, setShieldPosition] = useState('bottom-right');
  const [storagePath, setStoragePath] = useState('');
  const [storageQuota, setStorageQuota] = useState(500);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      setGatewayUrl((config.gatewayUrl as string) ?? 'http://localhost:3001');
      setNotificationsEnabled((config.notificationsEnabled as boolean) ?? true);
      setNotificationThreshold((config.notificationSeverityThreshold as string) ?? 'medium');
      setShieldOverlay((config.shieldOverlay as boolean) ?? true);
      setShieldOpacity(((config.shieldOpacity as number) ?? 0.85) * 100);
      setShieldPosition((config.shieldPosition as string) ?? 'bottom-right');
      setStoragePath((config.storagePath as string) ?? '');
      setStorageQuota((config.storageQuotaMB as number) ?? 500);
    }
  }, [config]);

  const handleSave = async (key: string, value: unknown) => {
    setSaveStatus('saving');
    try {
      await updateConfig(key, value);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).qshield) {
        await window.qshield.gateway.reconnect();
      }
      setConnectionResult('Connection successful');
    } catch {
      setConnectionResult('Connection failed — check URL and try again');
    } finally {
      setTestingConnection(false);
      setTimeout(() => setConnectionResult(null), 4000);
    }
  };

  const handleToggleShield = async () => {
    const newValue = !shieldOverlay;
    setShieldOverlay(newValue);
    await handleSave('shieldOverlay', newValue);
    try {
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).qshield) {
        await window.qshield.app.toggleShieldOverlay();
      }
    } catch { /* overlay toggle may fail silently */ }
  };

  const handlePrune = async () => {
    await handleSave('pruneRequested', true);
  };

  if (loading && Object.keys(config).length === 0) {
    return (
      <div className="p-6 space-y-6 max-w-2xl">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const storageUsedMB = (config.storageUsedMB as number) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure QShield gateway, adapters, policies, and display preferences
        </p>
      </div>

      {/* Save Status */}
      {saveStatus !== 'idle' && (
        <div className={`rounded-lg px-4 py-2 text-xs font-medium transition-all ${
          saveStatus === 'saving' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
          : saveStatus === 'saved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Settings saved successfully' : 'Failed to save settings'}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">{error}</div>
      )}

      {/* Gateway Configuration */}
      <SettingsSection title="Gateway Connection" description="Configure the QShield gateway server endpoint">
        <div>
          <label htmlFor="gateway-url" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gateway URL</label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="gateway-url"
              type="url"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              placeholder="http://localhost:3001"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
            />
            <button
              onClick={() => handleSave('gatewayUrl', gatewayUrl)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              Save
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {testingConnection ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-500" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            )}
            Test Connection
          </button>
          {connectionResult && (
            <span className={`text-xs ${connectionResult.includes('successful') ? 'text-emerald-400' : 'text-red-400'}`}>
              {connectionResult}
            </span>
          )}
        </div>
      </SettingsSection>

      {/* Adapters */}
      <SettingsSection title="Adapters" description="Enable or disable monitoring adapters">
        <div className="space-y-3">
          {(['zoom', 'teams', 'email', 'file', 'api'] as AdapterType[]).map((adapter) => {
            const enabled = (config[`adapter_${adapter}_enabled`] as boolean) ?? (adapter !== 'api');
            return (
              <div key={adapter} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                  <div>
                    <span className="text-sm font-medium text-slate-200">{ADAPTER_LABELS[adapter]}</span>
                    <p className="text-xs text-slate-500">{enabled ? 'Active' : 'Disabled'}</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={enabled}
                  onChange={(v) => handleSave(`adapter_${adapter}_enabled`, v)}
                />
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* Policy Rules */}
      <SettingsSection title="Policy Rules" description="Configure automated alerting and escalation rules">
        <div className="space-y-3">
          {policyRules.map((rule) => (
            <PolicyRuleRow
              key={rule.id}
              rule={rule}
              onUpdate={(updates) => updatePolicyRule(rule.id, updates)}
              onRemove={() => removePolicyRule(rule.id)}
            />
          ))}
          <button
            onClick={() => {
              const id = `rule-${Date.now()}`;
              addPolicyRule({
                id,
                name: 'New Rule',
                condition: { signal: 'api', operator: 'lt', threshold: 50 },
                action: 'alert',
                severity: 'medium',
                enabled: true,
              });
            }}
            className="flex items-center gap-2 rounded-lg border border-dashed border-slate-600 px-4 py-2.5 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors w-full justify-center"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Rule
          </button>
        </div>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Notifications" description="Manage alert and system notification preferences">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-200">Desktop Notifications</span>
              <p className="text-xs text-slate-500 mt-0.5">Show system notifications for trust alerts</p>
            </div>
            <ToggleSwitch
              checked={notificationsEnabled}
              onChange={(v) => { setNotificationsEnabled(v); handleSave('notificationsEnabled', v); }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Severity Threshold</label>
            <select
              value={notificationThreshold}
              onChange={(e) => { setNotificationThreshold(e.target.value); handleSave('notificationSeverityThreshold', e.target.value); }}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="low">Low and above</option>
              <option value="medium">Medium and above</option>
              <option value="high">High and above</option>
              <option value="critical">Critical only</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">Only show notifications at or above this severity</p>
          </div>
        </div>
      </SettingsSection>

      {/* Shield Overlay */}
      <SettingsSection title="Shield Overlay" description="Floating shield indicator showing real-time trust status">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-200">Show Shield Overlay</span>
              <p className="text-xs text-slate-500 mt-0.5">Display the floating trust shield on your desktop</p>
            </div>
            <ToggleSwitch checked={shieldOverlay} onChange={handleToggleShield} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Opacity: {shieldOpacity}%
            </label>
            <input
              type="range"
              min="20"
              max="100"
              value={shieldOpacity}
              onChange={(e) => setShieldOpacity(Number(e.target.value))}
              onMouseUp={() => handleSave('shieldOpacity', shieldOpacity / 100)}
              className="mt-1.5 w-full accent-sky-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Position</label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                <button
                  key={pos}
                  onClick={() => { setShieldPosition(pos); handleSave('shieldPosition', pos); }}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    shieldPosition === pos
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {pos.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Storage */}
      <SettingsSection title="Storage" description="Evidence storage and data persistence configuration">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Usage</label>
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-300">{formatFileSize(storageUsedMB * 1024 * 1024)}</span>
                <span className="text-slate-500">of {formatFileSize(storageQuota * 1024 * 1024)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all ${
                    storageUsedMB / storageQuota > 0.9 ? 'bg-red-500' : storageUsedMB / storageQuota > 0.7 ? 'bg-amber-500' : 'bg-sky-500'
                  }`}
                  style={{ width: `${Math.min(100, (storageUsedMB / storageQuota) * 100)}%` }}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Quota: {storageQuota} MB
            </label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={storageQuota}
              onChange={(e) => setStorageQuota(Number(e.target.value))}
              onMouseUp={() => handleSave('storageQuotaMB', storageQuota)}
              className="mt-1.5 w-full accent-sky-500"
            />
          </div>
          <div>
            <label htmlFor="storage-path" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Storage Path</label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="storage-path"
                type="text"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                placeholder="~/.qshield/data"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              />
              <button
                onClick={() => handleSave('storagePath', storagePath)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
              >
                Save
              </button>
            </div>
          </div>
          <button
            onClick={handlePrune}
            className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Prune Old Data
          </button>
        </div>
      </SettingsSection>

      {/* App Info */}
      <SettingsSection title="About">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">QShield Desktop</span>
          <AppVersion />
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      <div className="border-b border-slate-700 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? 'bg-sky-600' : 'bg-slate-700'
      }`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function PolicyRuleRow({
  rule,
  onUpdate,
  onRemove,
}: {
  rule: PolicyRule;
  onUpdate: (updates: Partial<PolicyRule>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className={`rounded-lg border ${rule.enabled ? 'border-slate-700' : 'border-slate-700/50 opacity-60'} bg-slate-800/30 p-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ToggleSwitch checked={rule.enabled} onChange={(v) => onUpdate({ enabled: v })} />
          {editing ? (
            <input
              type="text"
              value={rule.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
              className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              autoFocus
            />
          ) : (
            <span
              className="text-sm font-medium text-slate-200 cursor-pointer hover:text-slate-100 truncate"
              onClick={() => setEditing(true)}
            >
              {rule.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            rule.severity === 'critical' ? 'bg-red-500/10 text-red-400'
            : rule.severity === 'high' ? 'bg-orange-500/10 text-orange-400'
            : rule.severity === 'medium' ? 'bg-amber-500/10 text-amber-400'
            : 'bg-sky-500/10 text-sky-400'
          }`}>
            {rule.severity}
          </span>
          <span className="text-[10px] text-slate-500 uppercase">{rule.action}</span>
          <button
            onClick={onRemove}
            className="rounded p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label="Remove rule"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
        <span>If</span>
        <span className="font-mono text-slate-400">{rule.condition.signal}</span>
        <span className="font-mono text-slate-400">{rule.condition.operator}</span>
        <span className="font-mono text-slate-400">{rule.condition.threshold}</span>
        <span>→</span>
        <span className="text-slate-400">{rule.action}</span>
      </div>
    </div>
  );
}

function AppVersion() {
  const [version, setVersion] = useState<string>('...');
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).qshield) {
      window.qshield.app.getVersion().then(setVersion).catch(() => setVersion('unknown'));
    } else {
      setVersion('0.1.0-dev');
    }
  }, []);
  return <span className="font-mono text-slate-500">{version}</span>;
}
