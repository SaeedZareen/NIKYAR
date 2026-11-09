import * as React from "react"
import type { FieldErrors, FieldValues } from "react-hook-form"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { fieldId } from "./form-field"

type Props<TValues extends FieldValues> = {
  errors: FieldErrors<TValues>
  /** برچسب فارسی هر فیلد؛ فیلدهای تودرتو با مسیر نقطه‌دار، مثل «days.2.start». */
  labels: Record<string, string>
  /** شمارنده‌ی تلاش ارسال؛ با هر ارسال ناموفق، فوکوس به خلاصه می‌رود. */
  submitCount: number
}

/**
 * خلاصه‌ی خطا پس از ارسال ناموفق: خطای کلی سرور (اگر باشد) و فهرست خطاها با پیوند به هر فیلد.
 * فوکوس به خلاصه منتقل می‌شود تا صفحه‌خوان آن را بخواند.
 */
export function ErrorSummary<TValues extends FieldValues>({ errors, labels, submitCount }: Props<TValues>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const general = errors.root?.server?.message
  const items = flatten(errors).map(({ name, message }) => ({ name, label: labels[name] ?? labels[name.split(".")[0]] ?? name, message }))

  // فوکوس فقط یک‌بار پس از هر ارسال ناموفق؛ نه با هر تغییر خطا هنگام تایپ.
  const focusedFor = React.useRef(0)
  React.useEffect(() => {
    if (submitCount > focusedFor.current && (items.length > 0 || general)) {
      focusedFor.current = submitCount
      ref.current?.focus()
    }
  }, [submitCount, items.length, general])

  if ((!items.length && !general) || submitCount === 0) return null
  return (
    <Alert variant="destructive" ref={ref} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-destructive/40">
      <AlertCircle />
      <AlertTitle>{general ?? "لطفاً این موارد را اصلاح کنید:"}</AlertTitle>
      {items.length > 0 && (
      <AlertDescription>
        <ul className="list-disc ps-4">
          {items.map((i) => (
            <li key={i.name}>
              <a
                href={`#${fieldId(i.name)}`}
                className="underline underline-offset-2"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(fieldId(i.name))?.focus()
                }}
              >
                {i.label}
              </a>
              : {i.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
      )}
    </Alert>
  )
}

/** خطاهای تودرتو (ردیف‌های جدول، گروه‌ها) به فهرست تخت با مسیر نقطه‌دار؛ خطای کل آرایه با نام همان آرایه. */
function flatten(errors: object, prefix = ""): { name: string; message: string }[] {
  return Object.entries(errors).flatMap(([key, e]) => {
    if (!e || typeof e !== "object" || (prefix === "" && key === "root")) return []
    const name = key === "root" ? prefix.slice(0, -1) : `${prefix}${key}`
    const own = "message" in e && typeof e.message === "string" && e.message ? [{ name, message: e.message }] : []
    // خطای کل گروه و خطای خانه‌هایش در یک شیء می‌آیند؛ ref و types خود react-hook-form‌اند.
    const nested = Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "ref" && k !== "types" && v && typeof v === "object"))
    return [...own, ...flatten(nested, `${name}.`)]
  })
}
