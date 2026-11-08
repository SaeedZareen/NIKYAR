// بارگذاری فایل با نوار پیشرفت و امکان لغو (fetch پیشرفت ارسال را گزارش نمی‌کند؛ XMLHttpRequest می‌کند).
import { useQuery } from "@tanstack/react-query"
import { api, ApiError, csrfToken, unwrap, type Schemas } from "@/lib/api/client"
import { formatFileSize } from "@/lib/format"

export type StoredFile = Schemas["StoredFile"]
type FilePolicy = Schemas["FilePolicy"]

/** سقف حجم و نوع‌های مجاز (از تنظیمات «فایل‌ها و پیوست‌ها»). */
export function useFilePolicy() {
  return useQuery({ queryKey: ["files", "policy"], queryFn: () => unwrap(api.GET("/api/files/policy/")), staleTime: 5 * 60_000 })
}

/** نشانی نمایش فایل در مرورگر (تصویر و PDF). */
export const inlineUrl = (file: Pick<StoredFile, "url">) => `${file.url}?inline=1`

/** نوع‌های مجاز یک ناحیه‌ی بارگذاری: مجاز در تنظیمات، و در صورت نیاز فقط تصویر یا فقط نوع‌های تعیین‌شده‌ی همان فیلد. */
export function allowedTypes(policy: FilePolicy, imagesOnly = false, extensions?: string[]) {
  return policy.types.filter((t) => t.allowed && (!imagesOnly || t.is_image) && (!extensions?.length || extensions.includes(t.extension)))
}

/** بررسی پیش از بارگذاری با همان قواعد سرور؛ پیام خطا یا null. */
export function checkFile(file: File, policy: FilePolicy, imagesOnly = false, extensions?: string[]): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : ""
  const allowed = allowedTypes(policy, imagesOnly, extensions)
  if (!allowed.some((t) => t.extension === ext)) return `این نوع فایل پذیرفته نمی‌شود. نوع‌های مجاز: ${allowedLabels(allowed)}.`
  if (file.size > policy.max_size) return `حجم فایل بیش از سقف مجاز (${formatFileSize(policy.max_size)}) است.`
  if (file.size === 0) return "فایل خالی است."
  return null
}

export function allowedLabels(types: FilePolicy["types"]) {
  return [...new Set(types.map((t) => t.label))].join("، ")
}

export function uploadFile(
  file: File,
  { imagesOnly = false, onProgress, signal }: { imagesOnly?: boolean; onProgress?: (percent: number) => void; signal?: AbortSignal } = {}
): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const body = new FormData()
    body.append("file", file)
    body.append("images_only", String(imagesOnly))
    xhr.open("POST", "/api/files/")
    xhr.setRequestHeader("X-CSRFToken", csrfToken())
    xhr.responseType = "json"
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      if (xhr.status === 201) return resolve(xhr.response as StoredFile)
      const err = (xhr.response ?? {}) as { detail?: string; fields?: Record<string, string>; code?: string }
      reject(new ApiError(xhr.status, err.fields?.file ?? err.detail ?? "بارگذاری فایل ناموفق بود.", err.code, err.fields))
    }
    xhr.onerror = () => reject(new ApiError(0, "ارتباط با سرور برقرار نشد؛ اتصال شبکه را بررسی کنید.", "network"))
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"))
    signal?.addEventListener("abort", () => xhr.abort())
    xhr.send(body)
  })
}
