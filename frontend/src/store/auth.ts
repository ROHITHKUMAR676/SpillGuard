import { create } from "zustand";

interface AuthState {
  token?: string;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("ps26143_token") ?? undefined,
  setToken: (token) => {
    localStorage.setItem("ps26143_token", token);
    set({ token });
  }
}));
