import * as React from "react"
import type { FieldErrors, FieldValues } from "react-hook-form"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { fieldId } from "./form-field"

type Props<TValues extends FieldValues> = {
  errors: FieldErrors<TValues>
  /** برچسب فارسی هر فیلد. */
  labels: Partial<Record<keyof TValues & string, string>>
  /** شمارنده‌ی تلاش ارسال؛ با هر ارسال ناموفق، فوکوس به خلاصه می‌رود. */
  submitCount: number
}

/**
 * خلاصه‌ی خطا پس از ارسال ناموفق: فهرست خطاها با پیوند به هر فیلد.
 * فوکوس به خلاصه منتقل می‌شود تا صفحه‌خوان آن را بخواند.
 */
export function ErrorSummary<TValues extends FieldValues>({ errors, labels, submitCount }: Props<TValues>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const items = Object.entries(errors)
    .filter(([, e]) => e && typeof e === "object" && "message" in e && e.message)
    .map(([name, e]) => ({ name, label: labels[name as keyof TValues & string] ?? name, message: String((e as { message: string }).message) }))

  // فوکوس فقط یک‌بار پس از هر ارسال ناموفق؛ نه با هر تغییر خطا هنگام تایپ.
  const focusedFor = React.useRef(0)
  React.useEffect(() => {
    if (submitCount > focusedFor.current && items.length > 0) {
      focusedFor.current = submitCount
      ref.current?.focus()
    }
  }, [submitCount, items.length])

  if (!items.length || submitCount === 0) return null
  return (
    <Alert variant="destructive" ref={ref} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-destructive/40">
      <AlertCircle />
      <AlertTitle>لطفاً این موارد را اصلاح کنید:</AlertTitle>
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
    </Alert>
  )
}
