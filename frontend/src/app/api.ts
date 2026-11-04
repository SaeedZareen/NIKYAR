// ارتباط با سرور
const TOKEN_KEY = "nikyar_token";

export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(v: string | null) {
    try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* حالت خصوصی مرورگر */ }
  },
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields ?? {};
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T = unknown>(path: string, opts: { method?: Method; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Token ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError("ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.", 0);
  }
  if (res.status === 401) {
    tokenStore.set(null);
    if (!location.pathname.startsWith("/login")) location.href = "/login";
    throw new ApiError("ابتدا وارد سامانه شوید.", 401);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries((data?.fields ?? {}) as Record<string, unknown>)) {
      fields[k] = Array.isArray(v) ? String(v[0]) : String(v);
    }
    throw new ApiError(data?.detail ?? "درخواست انجام نشد.", res.status, fields);
  }
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const del = (path: string) => api(path, { method: "DELETE" });

export type Paged<T> = { count: number; results: T[] };

export async function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<Attachment>("/files/upload/", { form });
}

export type Attachment = { id: number; name: string; size: number; content_type: string; uploaded_at: string; url: string };
