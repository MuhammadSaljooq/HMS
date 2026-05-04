import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { User } from "@/types";

/** Browser: same-origin `/api` (see next.config rewrites) so Set-Cookie from the API applies to the app host. */
function resolveApiOrigin(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return (
    process.env.INTERNAL_API_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000"
  );
}

export const api = axios.create({
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

function getAuthStore() {
  // Lazy to avoid circular import with store/authStore.ts
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/store/authStore").useAuthStore as typeof import("@/store/authStore").useAuthStore;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = `${resolveApiOrigin()}/api`;
  const token = getAuthStore().getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

let refreshPromise: Promise<void> | null = null;

async function refreshSession(): Promise<void> {
  const { data } = await api.post<{ user: User; access_token: string }>("/auth/refresh", {}, { withCredentials: true });
  getAuthStore().setState({
    user: data.user,
    accessToken: data.access_token,
    isAuthenticated: true,
    role: data.user.role,
  });
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    if (status === 401 && original && !original._retry) {
      const url = original.url || "";
      if (
        url.includes("/auth/login") ||
        url.includes("/auth/refresh") ||
        url.includes("/auth/bootstrap") ||
        url.includes("/auth/logout")
      ) {
        return Promise.reject(error);
      }
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshSession().finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;
        return api(original);
      } catch {
        // Clear local auth state without triggering another API call.
        getAuthStore().setState({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          role: null,
        });
        if (typeof window !== "undefined") {
          const path = window.location.pathname;
          if (!path.startsWith("/login")) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

