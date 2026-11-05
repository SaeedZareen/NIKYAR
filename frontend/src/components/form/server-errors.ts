import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { ApiError, errorMessage } from "@/lib/api/client"

/**
 * خطای سرور را روی فرم می‌نشاند: پیام هر فیلد زیر همان فیلد و در خلاصه‌ی خطا؛
 * خطای کلی (قاعده‌ی کسب‌وکار، شبکه) بالای فرم.
 */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown) {
  const fields = error instanceof ApiError ? error.fields : {}
  const known = new Set(Object.keys(form.getValues()))
  let unmatched = ""
  for (const [name, message] of Object.entries(fields)) {
    if (known.has(name)) form.setError(name as Path<T>, { type: "server", message })
    else unmatched ||= message
  }
  if (unmatched || Object.keys(fields).length === 0) {
    form.setError("root.server", { type: "server", message: unmatched || errorMessage(error) })
  }
}
