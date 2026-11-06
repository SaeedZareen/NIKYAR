import * as React from "react"
import { checkFile, uploadFile, useFilePolicy, type StoredFile } from "@/lib/files"
import { errorMessage } from "@/lib/api/client"

export type UploadItem = { key: string; name: string; progress: number; error?: string; controller: AbortController }

/** صف بارگذاری: بررسی هر فایل با قواعد سرور، پیشرفت، لغو و پیام خطای هر فایل. */
export function useUploads({ imagesOnly = false, onUploaded }: { imagesOnly?: boolean; onUploaded: (file: StoredFile) => void }) {
  const policy = useFilePolicy()
  const [items, setItems] = React.useState<UploadItem[]>([])
  const update = (key: string, patch: Partial<UploadItem>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const remove = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key))
  const uploaded = React.useRef(onUploaded)
  React.useLayoutEffect(() => {
    uploaded.current = onUploaded
  })

  // بارگذاری‌های نیمه‌کاره هنگام بسته شدن صفحه لغو می‌شوند.
  const active = React.useRef(new Set<AbortController>())
  React.useEffect(() => () => active.current.forEach((c) => c.abort()), [])

  const start = (files: File[]) => {
    for (const file of files) {
      const key = crypto.randomUUID()
      const controller = new AbortController()
      const problem = policy.data ? checkFile(file, policy.data, imagesOnly) : null
      setItems((prev) => [...prev, { key, name: file.name, progress: 0, error: problem ?? undefined, controller }])
      if (problem) continue
      active.current.add(controller)
      uploadFile(file, { imagesOnly, signal: controller.signal, onProgress: (progress) => update(key, { progress }) })
        .then((stored) => {
          remove(key)
          uploaded.current(stored)
        })
        .catch((e) => (e instanceof DOMException && e.name === "AbortError" ? remove(key) : update(key, { error: errorMessage(e) })))
        .finally(() => active.current.delete(controller))
    }
  }

  return { policy: policy.data, items, start, cancel: (item: UploadItem) => item.controller.abort(), dismiss: (item: UploadItem) => remove(item.key) }
}
