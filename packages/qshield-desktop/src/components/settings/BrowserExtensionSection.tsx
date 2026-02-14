import { useEffect, useState, useCallback } from 'react';
import { isIPCAvailable } from '@/lib/mock-data';

interface ApiInfo {
  port: number;
  token: string;
  running: boolean;
}

export function BrowserExtensionSection() {
  const [apiInfo, setApiInfo] = useState<ApiInfo | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [showInstructions, setShowInstructions] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const fetchInfo = useCallback(async () => {
    if (!isIPCAvailable()) return;
    try {
      const info = await window.qshield.api.getInfo();
      setApiInfo(info);
    } catch {
      // API not available
    }
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const handleCopy = async () => {
    if (!apiInfo?.token) return;
    await navigator.clipboard.writeText(apiInfo.token);
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy'), 2000);
  };

  const handleRegenerate = async () => {
    if (!isIPCAvailable()) return;
    setRegenerating(true);
    try {
      const result = await window.qshield.api.regenerateToken();
      setApiInfo((prev) => prev ? { ...prev, token: result.token } : null);
    } catch {
      // Failed to regenerate
    } finally {
      setRegenerating(false);
    }
  };

  const running = apiInfo?.running ?? false;

  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-100">Browser Extension</h3>
        <p className="text-sm text-slate-400 mt-1">Connect the QShield browser extension to verify outgoing emails</p>
      </div>

      <div className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${running ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-200">{running ? 'Connected' : 'Not running'}</span>
          </div>
          <span className="text-sm text-slate-400 font-mono">Port: {apiInfo?.port ?? 3847}</span>
        </div>

        {/* API Token */}
        <div>
          <label className="text-xs text-slate-400 block mb-1.5">Extension Token</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-slate-900 border border-slate-700 rounded px-3 py-2 min-w-0">
              <span className="text-sm font-mono text-slate-300 truncate">
                {showToken ? (apiInfo?.token ?? '') : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
              </span>
            </div>
            <button
              onClick={() => setShowToken(!showToken)}
              className="px-2.5 py-2 text-sm text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 rounded transition-colors"
              title={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.828 2.828m4.243 4.243l2.828 2.828M6.343 6.343l11.314 11.314" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
            <button
              onClick={handleCopy}
              className="px-3 py-2 text-sm text-slate-300 hover:text-slate-100 bg-slate-800 border border-slate-700 rounded transition-colors"
            >
              {copyLabel}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-3 py-2 text-sm text-amber-400 hover:text-amber-300 bg-slate-800 border border-slate-700 rounded transition-colors disabled:opacity-50"
              title="This will disconnect the current extension"
            >
              {regenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>
        </div>

        {/* Setup Instructions */}
        <div>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <svg className={`h-4 w-4 transition-transform ${showInstructions ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            How to connect
          </button>
          {showInstructions && (
            <ol className="mt-3 ml-6 space-y-2 list-decimal">
              <li className="text-sm text-slate-400">Install the QShield extension from the Chrome Web Store</li>
              <li className="text-sm text-slate-400">Click the QShield extension icon in your browser toolbar</li>
              <li className="text-sm text-slate-400">Paste this token into the "API Token" field</li>
              <li className="text-sm text-slate-400">Click Save — the extension will connect to QShield Desktop</li>
            </ol>
          )}
        </div>

        {/* Auto-inject toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <div>
            <span className="text-sm text-slate-200">Auto-inject verification badge</span>
            <p className="text-xs text-slate-500 mt-0.5">Automatically add a verification badge to outgoing emails in Gmail and Outlook</p>
          </div>
          <AutoInjectToggle />
        </div>
      </div>
    </div>
  );
}

function AutoInjectToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!isIPCAvailable()) return;
    window.qshield.config.get('extensionAutoInject').then((val) => {
      if (typeof val === 'boolean') setEnabled(val);
    }).catch(() => {});
  }, []);

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    if (isIPCAvailable()) {
      try {
        await window.qshield.config.set('extensionAutoInject', next);
      } catch {
        setEnabled(!next); // revert on error
      }
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-slate-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}
