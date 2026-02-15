import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

// ── Types ────────────────────────────────────────────────────────────────────

interface SecureMessage {
  id: string;
  subject: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  currentViews: number;
  maxViews: number;
  shareUrl: string;
}

interface AccessLogEntry {
  timestamp: string;
  ip: string;
  userAgent: string;
  recipientEmail?: string;
  action: string;
}

interface CreateMessageOpts {
  subject: string;
  content: string;
  expiresIn: '1h' | '24h' | '7d' | '30d';
  maxViews: number;
  requireVerification: boolean;
  allowedRecipients: string[];
}

// ── Mock helpers ─────────────────────────────────────────────────────────────

let _mockId = 0;
function mockId(): string {
  _mockId += 1;
  return `mock-msg-${_mockId.toString(16).padStart(6, '0')}`;
}

function mockMessages(): SecureMessage[] {
  const now = Date.now();
  return [
    {
      id: mockId(),
      subject: 'Q4 Financial Report',
      createdAt: new Date(now - 86400000).toISOString(),
      expiresAt: new Date(now + 86400000 * 6).toISOString(),
      status: 'active',
      currentViews: 2,
      maxViews: 5,
      shareUrl: 'http://127.0.0.1:3847/api/v1/message/abc123#key',
    },
    {
      id: mockId(),
      subject: 'API Credentials',
      createdAt: new Date(now - 3600000).toISOString(),
      expiresAt: new Date(now + 3600000).toISOString(),
      status: 'active',
      currentViews: 0,
      maxViews: 1,
      shareUrl: 'http://127.0.0.1:3847/api/v1/message/def456#key',
    },
    {
      id: mockId(),
      subject: 'Old contract draft',
      createdAt: new Date(now - 86400000 * 10).toISOString(),
      expiresAt: new Date(now - 86400000).toISOString(),
      status: 'expired',
      currentViews: 3,
      maxViews: 10,
      shareUrl: 'http://127.0.0.1:3847/api/v1/message/ghi789#key',
    },
  ];
}

// ── Store ────────────────────────────────────────────────────────────────────

interface SecureMessageState {
  messages: SecureMessage[];
  loading: boolean;
  error: string | null;
  creating: boolean;
}

interface SecureMessageActions {
  fetchMessages: () => Promise<void>;
  createMessage: (opts: CreateMessageOpts) => Promise<SecureMessage>;
  destroyMessage: (id: string) => Promise<void>;
  copyLink: (id: string) => Promise<void>;
  getAccessLog: (id: string) => Promise<AccessLogEntry[]>;
}

type SecureMessageStore = SecureMessageState & SecureMessageActions;

const useSecureMessageStore = create<SecureMessageStore>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  creating: false,

  fetchMessages: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const messages = (await window.qshield.secureMessage.list()) as SecureMessage[];
        set({ messages, loading: false });
      } else {
        set({ messages: mockMessages(), loading: false });
      }
    } catch (err) {
      set({
        messages: mockMessages(),
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch messages',
      });
    }
  },

  createMessage: async (opts: CreateMessageOpts) => {
    set({ creating: true, error: null });
    try {
      let msg: SecureMessage;
      if (isIPCAvailable()) {
        msg = (await window.qshield.secureMessage.create(opts)) as SecureMessage;
      } else {
        msg = {
          id: mockId(),
          subject: opts.subject,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'active',
          currentViews: 0,
          maxViews: opts.maxViews,
          shareUrl: `http://127.0.0.1:3847/api/v1/message/${mockId()}#mockkey`,
        };
      }
      set({ messages: [msg, ...get().messages], creating: false });
      return msg;
    } catch (err) {
      set({
        creating: false,
        error: err instanceof Error ? err.message : 'Failed to create message',
      });
      throw err;
    }
  },

  destroyMessage: async (id: string) => {
    try {
      if (isIPCAvailable()) {
        await window.qshield.secureMessage.destroy(id);
      }
      set({ messages: get().messages.filter((m) => m.id !== id) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to destroy message' });
    }
  },

  copyLink: async (id: string) => {
    try {
      if (isIPCAvailable()) {
        await window.qshield.secureMessage.copyLink(id);
      }
    } catch {
      // silently fail for mock
    }
  },

  getAccessLog: async (id: string): Promise<AccessLogEntry[]> => {
    try {
      if (isIPCAvailable()) {
        return (await window.qshield.secureMessage.getAccessLog(id)) as AccessLogEntry[];
      }
      return [
        { timestamp: new Date().toISOString(), ip: '127.0.0.1', userAgent: 'Chrome/120', action: 'viewed' },
      ];
    } catch {
      return [];
    }
  },
}));

export default useSecureMessageStore;
