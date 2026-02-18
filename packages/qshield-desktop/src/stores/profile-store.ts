import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

interface ScoreHistoryEntry {
  timestamp: string;
  score: number;
  level: string;
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string;
}

interface LifetimeStats {
  totalDays: number;
  avgScore: number;
  currentStreak: number;
  longestStreak: number;
  currentGrade: string;
  trend: 'improving' | 'stable' | 'declining';
  totalSnapshots: number;
  totalEvents: number;
  totalAnomalies: number;
  milestones: Milestone[];
  recentScores: ScoreHistoryEntry[];
}

interface ProfileState {
  stats: LifetimeStats | null;
  history: ScoreHistoryEntry[];
  milestones: Milestone[];
  loading: boolean;
  error: string | null;

  fetchProfile: () => Promise<void>;
  fetchHistory: (days: number) => Promise<void>;
  fetchMilestones: () => Promise<void>;
}

function mockLifetimeStats(): LifetimeStats {
  return {
    totalDays: 42,
    avgScore: 82,
    currentStreak: 12,
    longestStreak: 18,
    currentGrade: 'A',
    trend: 'improving',
    totalSnapshots: 504,
    totalEvents: 2847,
    totalAnomalies: 3,
    milestones: [
      { id: 'first-day', title: 'First Guardian', description: 'Complete your first day of monitoring', icon: 'shield', earnedAt: '2026-01-05T10:00:00Z' },
      { id: 'week-streak', title: '7-Day Streak', description: 'Maintain score above 80 for 7 consecutive days', icon: 'fire', earnedAt: '2026-01-12T10:00:00Z' },
      { id: '100-events', title: 'Centurion', description: 'Process 100 security events', icon: 'bolt', earnedAt: '2026-01-15T10:00:00Z' },
      { id: 'a-grade', title: 'Grade A', description: 'Achieve an A grade in your daily summary', icon: 'star', earnedAt: '2026-01-18T10:00:00Z' },
      { id: 'zero-anomalies-week', title: 'Clean Slate', description: 'Go a full week with zero anomalies', icon: 'check', earnedAt: '2026-01-25T10:00:00Z' },
    ],
    recentScores: generateMockHistory(30),
  };
}

function generateMockHistory(days: number): ScoreHistoryEntry[] {
  const entries: ScoreHistoryEntry[] = [];
  const now = Date.now();
  let score = 75;

  for (let i = days; i >= 0; i--) {
    const drift = (Math.random() - 0.4) * 6;
    score = Math.max(40, Math.min(98, score + drift));
    const level =
      score >= 90 ? 'verified' :
      score >= 70 ? 'normal' :
      score >= 50 ? 'elevated' :
      score >= 30 ? 'warning' : 'critical';

    entries.push({
      timestamp: new Date(now - i * 86_400_000).toISOString(),
      score: Math.round(score * 10) / 10,
      level,
    });
  }

  return entries;
}

const ALL_MILESTONES: Array<{ id: string; title: string; description: string; icon: string; hint: string }> = [
  { id: 'first-day', title: 'First Guardian', description: 'Complete your first day of monitoring', icon: 'shield', hint: 'Start monitoring' },
  { id: 'week-streak', title: '7-Day Streak', description: 'Maintain score above 80 for 7 consecutive days', icon: 'fire', hint: 'days to go' },
  { id: 'month-streak', title: '30-Day Streak', description: 'Maintain score above 80 for 30 consecutive days', icon: 'fire', hint: 'days to go' },
  { id: 'a-grade', title: 'Grade A', description: 'Achieve an A grade in your daily summary', icon: 'star', hint: 'Raise your average score' },
  { id: 'a-plus', title: 'Grade A+', description: 'Achieve an A+ grade with 30+ day streak', icon: 'star', hint: 'Need 30+ day streak' },
  { id: '100-events', title: 'Centurion', description: 'Process 100 security events', icon: 'bolt', hint: 'events to go' },
  { id: '1000-events', title: 'Millennial', description: 'Process 1,000 security events', icon: 'bolt', hint: 'events to go' },
  { id: 'zero-anomalies-week', title: 'Clean Slate', description: 'Go a full week with zero anomalies', icon: 'check', hint: 'Maintain zero anomalies' },
  { id: 'first-asset', title: 'Asset Guardian', description: 'Register your first high-trust asset', icon: 'shield', hint: 'Add a high-trust asset' },
  { id: '5-assets', title: 'Vault Keeper', description: 'Register 5 high-trust assets', icon: 'shield', hint: 'assets to go' },
];

export { ALL_MILESTONES };
export type { ScoreHistoryEntry, Milestone, LifetimeStats };

const useProfileStore = create<ProfileState>((set) => ({
  stats: null,
  history: [],
  milestones: [],
  loading: false,
  error: null,

  fetchProfile: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const stats = await window.qshield.profile.get();
        set({ stats, loading: false });
      } else {
        set({ stats: mockLifetimeStats(), loading: false });
      }
    } catch (err) {
      set({
        stats: mockLifetimeStats(),
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load profile',
      });
    }
  },

  fetchHistory: async (days: number) => {
    try {
      if (isIPCAvailable()) {
        const history = await window.qshield.profile.history(days);
        set({ history });
      } else {
        set({ history: generateMockHistory(days) });
      }
    } catch {
      set({ history: generateMockHistory(days) });
    }
  },

  fetchMilestones: async () => {
    try {
      if (isIPCAvailable()) {
        const milestones = await window.qshield.profile.milestones();
        set({ milestones });
      } else {
        set({ milestones: mockLifetimeStats().milestones });
      }
    } catch {
      set({ milestones: mockLifetimeStats().milestones });
    }
  },
}));

export default useProfileStore;
