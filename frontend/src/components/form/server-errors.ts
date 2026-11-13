import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { ApiError, errorMessage } from "@/lib/api/client"

/**
 * خطای سرور را روی فرم می‌نشاند: پیام هر فیلد زیر همان فیلد و در خلاصه‌ی خطا؛
 * خطای کلی (قاعده‌ی کسب‌وکار، شبکه) بالای فرم. toScreen نام خطای خانه‌ی گروه را به جای همان خانه روی صفحه می‌برد.
 */
export function applyServerErrors<T extends FieldValues, O extends FieldValues = T>(form: UseFormReturn<T, unknown, O>, error: unknown, toScreen: (name: string) => string = (n) => n) {
  const fields = error instanceof ApiError ? error.fields : {}
  const known = new Set(Object.keys(form.getValues()))
  let unmatched = ""
  // خطای کل یک گروه پیش از خطای خانه‌هایش، تا روی آن‌ها ننشیند («items» پیش از «items.0.qty»)
  for (const [name, message] of Object.entries(fields).sort(([a], [b]) => a.length - b.length)) {
    const screen = toScreen(name)
    if (known.has(screen.split(".")[0])) form.setError(screen as Path<T>, { type: "server", message })
    else unmatched ||= message
  }
  if (unmatched || Object.keys(fields).length === 0) {
    form.setError("root.server", { type: "server", message: unmatched || errorMessage(error) })
  }
}
