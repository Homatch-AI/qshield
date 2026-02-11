import { useEffect, useState } from 'react';
import useConfigStore from '@/stores/config-store';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export default function Settings() {
  const { config, loading, error, fetchConfig, updateConfig } = useConfigStore();

  const [gatewayUrl, setGatewayUrl] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [shieldOverlay, setShieldOverlay] = useState(true);
  const [storagePath, setStoragePath] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      setGatewayUrl((config.gatewayUrl as string) ?? 'http://localhost:3001');
      setNotificationsEnabled((config.notificationsEnabled as boolean) ?? true);
      setShieldOverlay((config.shieldOverlay as boolean) ?? true);
      setStoragePath((config.storagePath as string) ?? '');
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

  const handleToggleShield = async () => {
    const newValue = !shieldOverlay;
    setShieldOverlay(newValue);
    await handleSave('shieldOverlay', newValue);
    try {
      await window.qshield.app.toggleShieldOverlay();
    } catch {
      // Shield toggle IPC may fail silently
    }
  };

  if (loading && Object.keys(config).length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure QShield gateway, notifications, and display preferences
        </p>
      </div>

      {/* Save Status */}
      {saveStatus !== 'idle' && (
        <div
          className={`rounded-lg px-4 py-2 text-xs font-medium transition-all ${
            saveStatus === 'saving'
              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
              : saveStatus === 'saved'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {saveStatus === 'saving'
            ? 'Saving...'
            : saveStatus === 'saved'
            ? 'Settings saved successfully'
            : 'Failed to save settings'}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Gateway Configuration */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Gateway Connection</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure the QShield gateway server endpoint
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="gateway-url" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Gateway URL
            </label>
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

          <button
            onClick={() => window.qshield.gateway.reconnect()}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Reconnect
          </button>
        </div>
      </section>

      {/* Notifications */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Notifications</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage alert and system notification preferences
          </p>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-200">Desktop Notifications</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Show system notifications for trust alerts
              </p>
            </div>
            <button
              onClick={() => {
                const newValue = !notificationsEnabled;
                setNotificationsEnabled(newValue);
                handleSave('notificationsEnabled', newValue);
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                notificationsEnabled ? 'bg-sky-600' : 'bg-slate-700'
              }`}
              role="switch"
              aria-checked={notificationsEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                  notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Shield Overlay */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Shield Overlay</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Floating shield indicator showing real-time trust status
          </p>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-200">Show Shield Overlay</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Display the floating trust shield on your desktop
              </p>
            </div>
            <button
              onClick={handleToggleShield}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                shieldOverlay ? 'bg-sky-600' : 'bg-slate-700'
              }`}
              role="switch"
              aria-checked={shieldOverlay}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                  shieldOverlay ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Storage */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Storage</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Evidence storage and data persistence configuration
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="storage-path" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Storage Path
            </label>
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
        </div>
      </section>

      {/* App Info */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">About</h2>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">QShield Desktop</span>
            <AppVersion />
          </div>
        </div>
      </section>
    </div>
  );
}

function AppVersion() {
  const [version, setVersion] = useState<string>('...');

  useEffect(() => {
    window.qshield.app.getVersion().then(setVersion).catch(() => setVersion('unknown'));
  }, []);

  return <span className="font-mono text-slate-500">{version}</span>;
}
