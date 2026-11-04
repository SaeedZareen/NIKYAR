// ارتباط با سرور
const TOKEN_KEY = "nikyar_token";

export const auth = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set token(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* */ }
  },
};

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth.token) headers.Authorization = `Token ${auth.token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("ارتباط با سرور برقرار نشد.", 0);
  }
  if (res.status === 401) {
    auth.token = null;
    window.location.href = "/login";
    throw new ApiError("ابتدا وارد سامانه شوید.", 401);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    let msg = data?.detail;
    if (!msg && data && typeof data === "object") {
      const first = Object.entries(data)[0];
      if (first) msg = Array.isArray(first[1]) ? first[1][0] : String(first[1]);
    }
    throw new ApiError(msg || "خطایی رخ داد.", res.status, data?.fields);
  }
  return data;
}
