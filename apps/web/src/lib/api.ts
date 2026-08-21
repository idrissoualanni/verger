"use client";

/**
 * Helpers fetch pour l'API (routes /api/* proxifiées par Next).
 * Les cookies de session partent automatiquement (same-origin).
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401) {
      // Session absente/expirée → redirection vers le login (option A du plan
      // RBAC). On évite la boucle si on est déjà sur /login.
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        const cb = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        window.location.href = `/login?callbackUrl=${cb}`;
      }
      throw new ApiError("Veuillez vous connecter", 401);
    }
    if (res.status === 403) {
      throw new ApiError("Accès refusé pour votre rôle", 403);
    }
    throw new ApiError((body as any)?.error ?? `Erreur ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
