import { api } from "./client";

export function login(username: string, password: string) {
  return api<{ access_token: string; token_type: "bearer" }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}
