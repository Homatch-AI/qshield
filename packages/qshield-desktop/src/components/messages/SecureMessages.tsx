import { useState, useEffect } from 'react';
import useSecureMessageStore from '@/stores/secure-message-store';

// ── Types ────────────────────────────────────────────────────────────────────

type View = 'list' | 'compose' | 'detail';

interface AccessLogEntry {
  timestamp: string;
  ip: string;
  userAgent: string;
  recipientEmail?: string;
  action: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Active' },
  expired: { bg: 'bg-slate-500/10', text: 'text-slate-400', label: 'Expired' },
  destroyed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Destroyed' },
};

// ── List View ────────────────────────────────────────────────────────────────

function MessageList({
  onCompose,
  onSelect,
}: {
  onCompose: () => void;
  onSelect: (id: string) => void;
}) {
  const messages = useSecureMessageStore((s) => s.messages);
  const loading = useSecureMessageStore((s) => s.loading);
  const fetchMessages = useSecureMessageStore((s) => s.fetchMessages);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Secure Messages</h1>
          <p className="text-sm text-slate-400 mt-1">
            Send encrypted, self-destructing messages with end-to-end encryption
          </p>
        </div>
        <button
          onClick={onCompose}
          className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Message
        </button>
      </div>

      {/* Messages list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="h-4 w-1/3 rounded bg-slate-700" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-700/50" />
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 py-16">
          <svg className="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="mt-3 text-sm text-slate-400">No secure messages yet</p>
          <button
            onClick={onCompose}
            className="mt-4 rounded-lg bg-sky-500/10 px-4 py-2 text-sm text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            Create your first message
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const style = STATUS_STYLES[msg.status] ?? STATUS_STYLES.active;
            return (
              <button
                key={msg.id}
                onClick={() => onSelect(msg.id)}
                className="w-full flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-left hover:border-slate-600 hover:bg-slate-800 transition-colors"
              >
                {/* Lock icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-700/50">
                  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{msg.subject}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>Created {timeAgo(msg.createdAt)}</span>
                    <span className="text-slate-700">|</span>
                    <span>{msg.status === 'active' ? `Expires in ${timeUntil(msg.expiresAt)}` : 'Expired'}</span>
                    <span className="text-slate-700">|</span>
                    <span>{msg.currentViews}/{msg.maxViews} views</span>
                  </div>
                </div>

                {/* Arrow */}
                <svg className="h-4 w-4 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Compose View ─────────────────────────────────────────────────────────────

function ComposeMessage({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const createMessage = useSecureMessageStore((s) => s.createMessage);
  const creating = useSecureMessageStore((s) => s.creating);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [expiresIn, setExpiresIn] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [maxViews, setMaxViews] = useState(5);
  const [requireVerification, setRequireVerification] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!content.trim()) {
      setError('Message content is required');
      return;
    }

    try {
      const msg = await createMessage({
        subject: subject.trim(),
        content: content.trim(),
        expiresIn,
        maxViews,
        requireVerification,
        allowedRecipients: recipients
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      });
      onCreated(msg.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create message');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-slate-100">New Secure Message</h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., API Credentials for Staging"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Message Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="Enter the sensitive content to encrypt..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            Content is encrypted with AES-256-GCM. The key is shared via URL fragment and never sent to any server.
          </p>
        </div>

        {/* Options row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Expires In */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Expires In</label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value as typeof expiresIn)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </div>

          {/* Max Views */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Max Views</label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxViews}
              onChange={(e) => setMaxViews(parseInt(e.target.value, 10) || 1)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Allowed Recipients */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Allowed Recipients <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Comma-separated emails. Leave empty to allow anyone with the link.
          </p>
        </div>

        {/* Require Verification */}
        <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 cursor-pointer hover:border-slate-600 transition-colors">
          <input
            type="checkbox"
            checked={requireVerification}
            onChange={(e) => setRequireVerification(e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
          />
          <div>
            <span className="text-sm font-medium text-slate-200">Require email verification</span>
            <p className="text-xs text-slate-500 mt-0.5">
              Recipients must verify their email before viewing the message
            </p>
          </div>
        </label>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Encrypting...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Encrypt & Create
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Detail View ──────────────────────────────────────────────────────────────

function MessageDetail({ messageId, onBack }: { messageId: string; onBack: () => void }) {
  const messages = useSecureMessageStore((s) => s.messages);
  const destroyMessage = useSecureMessageStore((s) => s.destroyMessage);
  const copyLink = useSecureMessageStore((s) => s.copyLink);
  const getAccessLog = useSecureMessageStore((s) => s.getAccessLog);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  const msg = messages.find((m) => m.id === messageId);

  useEffect(() => {
    if (!messageId) return;
    setLoadingLog(true);
    getAccessLog(messageId).then((log) => {
      setAccessLog(log);
      setLoadingLog(false);
    });
  }, [messageId, getAccessLog]);

  if (!msg) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
          <p className="text-sm text-slate-400">Message not found</p>
        </div>
      </div>
    );
  }

  const style = STATUS_STYLES[msg.status] ?? STATUS_STYLES.active;
  const isActive = msg.status === 'active' && new Date(msg.expiresAt) > new Date();

  const handleCopy = async () => {
    await copyLink(msg.id);
    // Also copy to clipboard directly for mock mode
    try {
      await navigator.clipboard.writeText(msg.shareUrl);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDestroy = async () => {
    await destroyMessage(msg.id);
    onBack();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100 truncate">{msg.subject}</h1>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Created</p>
          <p className="mt-1 text-sm font-medium text-slate-200">{timeAgo(msg.createdAt)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Expires</p>
          <p className="mt-1 text-sm font-medium text-slate-200">
            {isActive ? `in ${timeUntil(msg.expiresAt)}` : 'Expired'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Views</p>
          <p className="mt-1 text-sm font-medium text-slate-200">{msg.currentViews} / {msg.maxViews}</p>
        </div>
      </div>

      {/* Share URL */}
      {isActive && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">Share Link</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-slate-900 px-3 py-2 text-xs text-slate-300 font-mono">
              {msg.shareUrl}
            </code>
            <button
              onClick={handleCopy}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                copied
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            The encryption key is in the URL fragment (#) and is never sent to the server.
          </p>
        </div>
      )}

      {/* Access Log */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
        <h2 className="text-sm font-medium text-slate-300 mb-3">Access Log</h2>
        {loadingLog ? (
          <div className="animate-pulse space-y-2">
            <div className="h-3 w-2/3 rounded bg-slate-700" />
            <div className="h-3 w-1/2 rounded bg-slate-700" />
          </div>
        ) : accessLog.length === 0 ? (
          <p className="text-xs text-slate-500">No access recorded yet</p>
        ) : (
          <div className="space-y-2">
            {accessLog.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-slate-500 w-28 shrink-0">{timeAgo(entry.timestamp)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  entry.action === 'verified' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {entry.action}
                </span>
                {entry.recipientEmail && (
                  <span className="text-slate-400 truncate">{entry.recipientEmail}</span>
                )}
                <span className="text-slate-600 truncate ml-auto">{entry.userAgent}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {isActive && (
        <div className="flex items-center gap-3 pt-2">
          {confirmDestroy ? (
            <>
              <span className="text-sm text-red-400">Destroy this message permanently?</span>
              <button
                onClick={handleDestroy}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
              >
                Yes, Destroy
              </button>
              <button
                onClick={() => setConfirmDestroy(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDestroy(true)}
              className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Destroy Message
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SecureMessages() {
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-3xl">
      {view === 'list' && (
        <MessageList
          onCompose={() => setView('compose')}
          onSelect={(id) => {
            setSelectedId(id);
            setView('detail');
          }}
        />
      )}
      {view === 'compose' && (
        <ComposeMessage
          onBack={() => setView('list')}
          onCreated={(id) => {
            setSelectedId(id);
            setView('detail');
          }}
        />
      )}
      {view === 'detail' && selectedId && (
        <MessageDetail
          messageId={selectedId}
          onBack={() => {
            setSelectedId(null);
            setView('list');
          }}
        />
      )}
    </div>
  );
}
