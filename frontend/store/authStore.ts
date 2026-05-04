import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { api } from "@/lib/api";
import type { User, UserRole } from "@/types";

/** SSR / non-browser: persist must still attach `api.persist` (see zustand persist when storage is missing). */
const noopWebStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
} as unknown as Storage;

type AuthState = {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setUser: (user: User | null) => void;
  hydrateFromServer: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      role: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          role: user?.role ?? null,
        }),

      login: async (email, password) => {
        const { data } = await api.post<{ user: User; access_token: string }>("/auth/login", { email, password });
        set({
          user: data.user,
          isAuthenticated: true,
          role: data.user.role,
          accessToken: data.access_token,
        });
      },

      refreshToken: async () => {
        const { data } = await api.post<{ user: User; access_token: string }>("/auth/refresh", {});
        set({
          user: data.user,
          isAuthenticated: true,
          role: data.user.role,
          accessToken: data.access_token,
        });
      },

      logout: async () => {
        try {
          await api.post("/auth/logout");
        } catch {
          /* ignore */
        }
        set({ user: null, accessToken: null, isAuthenticated: false, role: null });
      },

      hydrateFromServer: async () => {
        if (!get().isAuthenticated && !get().user) {
          try {
            const { data } = await api.get<User>("/auth/me");
            get().setUser(data);
          } catch {
            /* not logged in */
          }
          return;
        }
        try {
          const { data } = await api.get<User>("/auth/me");
          get().setUser(data);
        } catch {
          set({ user: null, accessToken: null, isAuthenticated: false, role: null });
        }
      },
    }),
    {
      name: "hms-auth",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : noopWebStorage,
      ),
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        role: s.role,
        accessToken: s.accessToken,
      }),
    },
  ),
);
