import { useAuthStore } from "../store/auth";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(payload.error?.message ?? payload.detail?.message ?? response.statusText);
  }
  return response.json() as Promise<T>;
}
