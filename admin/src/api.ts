// API client with JWT storage + automatic refresh-token rotation.

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: "CUSTOMER" | "DRIVER" | "ADMIN" | "SUPER_ADMIN";
  twoFactorEnabled: boolean;
}

const store = {
  get access() { return localStorage.getItem("meshily.access"); },
  get refresh() { return localStorage.getItem("meshily.refresh"); },
  get user(): AdminUser | null {
    const raw = localStorage.getItem("meshily.user");
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  },
  save(user: AdminUser, accessToken: string, refreshToken: string) {
    localStorage.setItem("meshily.user", JSON.stringify(user));
    localStorage.setItem("meshily.access", accessToken);
    localStorage.setItem("meshily.refresh", refreshToken);
  },
  clear() {
    localStorage.removeItem("meshily.user");
    localStorage.removeItem("meshily.access");
    localStorage.removeItem("meshily.refresh");
  },
};

export { store as session };

async function tryRefresh(): Promise<boolean> {
  const refreshToken = store.refresh;
  if (!refreshToken) return false;
  const r = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!r.ok) { store.clear(); return false; }
  const data = await r.json();
  store.save(data.user, data.accessToken, data.refreshToken);
  return true;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(store.access ? { Authorization: `Bearer ${store.access}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (r.status === 401 && !retried && (await tryRefresh())) {
    return api<T>(path, options, true);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string }).error ?? r.statusText);
  return data as T;
}
