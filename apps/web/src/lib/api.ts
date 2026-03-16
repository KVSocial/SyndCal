export const API_BASE = import.meta.env.PUBLIC_API_BASE || "http://localhost:4000";

async function request(path: string, options: RequestInit = {}) {
  const csrfToken = typeof document !== "undefined" ? localStorage.getItem("csrfToken") : null;
  const headers = { "Content-Type": "application/json" } as Record<string, string>;
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
    ...options,
  });
  const data = await res.json();
  if (data?.csrfToken) {
    localStorage.setItem("csrfToken", data.csrfToken);
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Check if user is authenticated (server-side safe)
export async function checkAuth(): Promise<boolean> {
  try {
    await request("/api/v1/auth/me");
    return true;
  } catch {
    return false;
  }
}

export const api = {
  // Auth
  me: () => request("/api/v1/auth/me"),
  register: (payload: any) => request("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: any) => request("/api/v1/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  refresh: () => request("/api/v1/auth/refresh", { method: "POST" }),
  logout: () => request("/api/v1/auth/logout", { method: "POST" }).finally(() => {
    if (typeof document !== "undefined") {
      localStorage.removeItem("csrfToken");
    }
  }),
  verify: (token: string) => request(`/api/v1/auth/verify?token=${token}`),
  forgotPassword: (email: string) => request("/api/v1/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request("/api/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  resendVerification: (email: string) => request("/api/v1/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }),
  createSyndicate: (payload: any) => request("/api/v1/syndicates", { method: "POST", body: JSON.stringify(payload) }),
  listSyndicates: () => request("/api/v1/syndicates"),
  listInvites: (id: string) => request(`/api/v1/syndicates/${id}/invites`),
  createInvite: (id: string, payload: any) => request(`/api/v1/syndicates/${id}/invites`, { method: "POST", body: JSON.stringify(payload) }),
  acceptInvite: (payload: any) => request(`/api/v1/invites/accept`, { method: "POST", body: JSON.stringify(payload) }),
  listReservations: (id: string) => request(`/api/v1/syndicates/${id}/reservations`),
  createReservation: (id: string, payload: any) => request(`/api/v1/syndicates/${id}/reservations`, { method: "POST", body: JSON.stringify(payload) }),
  dashboard: () => request(`/api/v1/dashboard`),
  
  // JVZoo API methods
  getJvzooCredentials: () => request("/api/v1/jvzoo/credentials"),
  saveJvzooCredentials: (payload: { apiKey: string }) => request("/api/v1/jvzoo/credentials", { method: "POST", body: JSON.stringify(payload) }),
  deleteJvzooCredentials: () => request("/api/v1/jvzoo/credentials", { method: "DELETE" }),
  importJvzooTransactions: () => request("/api/v1/jvzoo/import", { method: "POST" }),
  getJvzooTransactions: (page?: number, limit?: number) => request(`/api/v1/jvzoo/transactions?page=${page || 1}&limit=${limit || 50}`),
  
  // Leaderboard API methods
  getSyndicateSettings: (id: string) => request(`/api/v1/syndicates/${id}/settings`),
  updateSyndicateSettings: (id: string, payload: any) => request(`/api/v1/syndicates/${id}/settings`, { method: "PUT", body: JSON.stringify(payload) }),
  getLeaderboard: (id: string, timeFilter?: string) => request(`/api/v1/syndicates/${id}/leaderboard?timeFilter=${timeFilter || "all"}`),
};
