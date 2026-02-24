import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

type ExecutionMode = 'HUMAN_DIRECT' | 'AI_ASSISTED' | 'AI_AUTONOMOUS';
type AITrustState = 'VALID' | 'DEGRADED' | 'INVALID' | 'FROZEN';

export interface AgentSession {
  sessionId: string;
  agentName: string;
  executionMode: ExecutionMode;
  startedAt: string;
  lastActivityAt: string;
  aiTrustState: AITrustState;
  riskVelocity: number;
  scopeExpansions: number;
  totalActions: number;
  allowedPaths: string[];
  allowedDomains: string[];
  allowedApis: string[];
  delegationDepth: number;
  frozen: boolean;
  frozenReason?: string;
}

interface AIStore {
  sessions: AgentSession[];
  loading: boolean;
  error: string | null;
  selectedSessionId: string | null;

  fetchSessions: () => Promise<void>;
  freezeSession: (id: string, reason?: string) => Promise<void>;
  unfreezeSession: (id: string) => Promise<void>;
  allowAction: (id: string, scope: 'once' | 'session') => Promise<void>;
  selectSession: (id: string | null) => void;
}

export const useAIStore = create<AIStore>((set, get) => ({
  sessions: [],
  loading: false,
  error: null,
  selectedSessionId: null,

  fetchSessions: async () => {
    if (!isIPCAvailable()) return;
    set({ loading: true, error: null });
    try {
      const sessions = await window.qshield.ai.sessions() as AgentSession[];
      set({ sessions, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  freezeSession: async (id, reason) => {
    if (!isIPCAvailable()) return;
    try {
      await window.qshield.ai.freeze(id, reason);
      await get().fetchSessions();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  unfreezeSession: async (id) => {
    if (!isIPCAvailable()) return;
    try {
      await window.qshield.ai.unfreeze(id);
      await get().fetchSessions();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  allowAction: async (id, scope) => {
    if (!isIPCAvailable()) return;
    try {
      await window.qshield.ai.allow(id, scope);
      await get().fetchSessions();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  selectSession: (id) => set({ selectedSessionId: id }),
}));
