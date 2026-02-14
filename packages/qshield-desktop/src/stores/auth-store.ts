import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';
import useLicenseStore from '@/stores/license-store';

interface AuthState {
  user: { id: string; email: string; name: string; edition: string } | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restore: () => Promise<boolean>;
  switchEdition: (edition: string) => Promise<boolean>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  authenticated: false,
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      if (!isIPCAvailable()) {
        set({ loading: false, error: 'IPC not available' });
        return false;
      }
      const result = await window.qshield.auth.login(email, password) as {
        user: { id: string; email: string; name: string; edition: string };
      };
      set({
        user: result.user,
        authenticated: true,
        loading: false,
      });
      // Refresh license after login
      await useLicenseStore.getState().fetchLicense();
      return true;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      });
      return false;
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ loading: true, error: null });
    try {
      if (!isIPCAvailable()) {
        set({ loading: false, error: 'IPC not available' });
        return false;
      }
      const result = await window.qshield.auth.register(email, password, name) as {
        user: { id: string; email: string; name: string; edition: string };
      };
      set({
        user: result.user,
        authenticated: true,
        loading: false,
      });
      // Refresh license after registration
      await useLicenseStore.getState().fetchLicense();
      return true;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      });
      return false;
    }
  },

  logout: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        await window.qshield.auth.logout();
      }
      set({
        user: null,
        authenticated: false,
        loading: false,
      });
      // Reset license store to defaults
      await useLicenseStore.getState().fetchLicense();
    } catch (err) {
      set({
        user: null,
        authenticated: false,
        loading: false,
        error: err instanceof Error ? err.message : 'Logout failed',
      });
    }
  },

  restore: async () => {
    set({ loading: true, error: null });
    try {
      if (!isIPCAvailable()) {
        set({ loading: false });
        return false;
      }
      const restored = await window.qshield.auth.restore();
      if (restored) {
        const user = await window.qshield.auth.getUser() as {
          id: string; email: string; name: string; edition: string;
        } | null;
        set({
          user,
          authenticated: true,
          loading: false,
        });
        // Refresh license after session restore
        await useLicenseStore.getState().fetchLicense();
        return true;
      }
      set({ loading: false });
      return false;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Session restore failed',
      });
      return false;
    }
  },

  switchEdition: async (edition: string) => {
    try {
      if (!isIPCAvailable()) return false;
      await window.qshield.auth.switchEdition(edition);
      // Re-fetch user to get updated edition
      const user = await window.qshield.auth.getUser() as {
        id: string; email: string; name: string; edition: string;
      } | null;
      set({ user });
      // Refresh license store with new edition features
      await useLicenseStore.getState().fetchLicense();
      return true;
    } catch {
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
