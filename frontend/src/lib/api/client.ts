// کارخواه API با نوع‌های خودکار از OpenAPI سرور (npm run api:types).
// خطاها همیشه ApiError با پیام فارسی سرور و پیام هر فیلد هستند.
import createClient, { type Middleware } from "openapi-fetch"
import type { components, paths } from "./schema"

export type Schemas = components["schemas"]

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>

  constructor(status: number, message: string, code = "error", fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

const NETWORK_ERROR = "ارتباط با سرور برقرار نشد؛ اتصال شبکه و روشن بودن سرور را بررسی کنید."

function cookie(name: string): string {
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? ""
}

/** توکن CSRF نشست؛ همراه هر درخواست تغییر‌دهنده فرستاده می‌شود. */
export const csrfToken = () => decodeURIComponent(cookie("csrftoken"))

const csrf: Middleware = {
  onRequest({ request }) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) request.headers.set("X-CSRFToken", csrfToken())
    return request
  },
}

export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" })
api.use(csrf)

type Result<T> = { data?: T; error?: unknown; response: Response }

/** نتیجه‌ی openapi-fetch را باز می‌کند: داده، یا پرتاب ApiError با پیام فارسی. */
export async function unwrap<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>
  try {
    result = await request
  } catch {
    throw new ApiError(0, NETWORK_ERROR, "network")
  }
  const { data, error, response } = result
  if (response.ok) return data as T
  const body = (error ?? {}) as { detail?: string; fields?: Record<string, string>; code?: string }
  const message = body.detail ?? (response.status >= 500 ? "خطای داخلی سرور رخ داد؛ دوباره تلاش کنید." : NETWORK_ERROR)
  throw new ApiError(response.status, message, body.code, body.fields)
}

/** پیام قابل نمایش هر خطا (برای اعلان‌ها). */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "خطای پیش‌بینی‌نشده رخ داد؛ دوباره تلاش کنید."
}
