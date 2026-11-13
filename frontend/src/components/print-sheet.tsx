import * as React from "react"
import { useSearchParams } from "react-router"
import { Printer } from "lucide-react"
import { useBranding } from "@/app/branding"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"

type SheetProps = {
  /** عنوان زبانه‌ی مرورگر (نام پیش‌فرض فایل PDF)؛ تا رسیدن داده خالی. */
  title?: string
  /** عنوان صفحه برای صفحه‌خوان هنگام بارگذاری، مثل «چاپ درخواست». */
  loadingLabel: string
  /** داده رسیده است؛ تا آن زمان اسکلت (یا خطا) نشان داده می‌شود. */
  ready: boolean
  error?: unknown
  /** محتوای برگه؛ printedAt زمان باز شدن صفحه برای پای برگه است. */
  children: (printedAt: string) => React.ReactNode
}

/**
 * برگه‌ی چاپ A4 بی پوسته‌ی برنامه (ثبت فرم، درخواست، نامه‌ی پرسنلی): کاغذ همیشه روشن، نوار «چاپ» بیرون از کاغذ،
 * و با `?print=1` پنجره‌ی چاپ پس از رسیدن داده و بارگذاری تصویرها (لوگو و امضاها) خودکار باز می‌شود.
 */
export function PrintSheet({ title, loadingLabel, ready, error, children }: SheetProps) {
  const [params] = useSearchParams()
  const auto = params.get("print") === "1"
  const [printedAt] = React.useState(() => formatDateTime(new Date()))

  // کاغذ همیشه روشن است، حتی وقتی برنامه در حالت تیره است (این صفحه در زبانه‌ی جداگانه باز می‌شود)
  React.useEffect(() => {
    const root = document.documentElement
    const dark = root.classList.contains("dark")
    root.classList.remove("dark")
    return () => void (dark && root.classList.add("dark"))
  }, [])

  React.useEffect(() => {
    if (title) document.title = title
  }, [title])

  React.useEffect(() => {
    if (!ready || !auto) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))))
      if (!cancelled) window.print()
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [ready, auto])

  if (!ready) {
    return (
      <main className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 p-4">
        <h1 className="sr-only">{loadingLabel}</h1>
        {error ? <p className="text-xs text-destructive">{errorMessage(error)}</p> : <Skeleton className="h-96 w-full" />}
      </main>
    )
  }
  return (
    <main className="min-h-svh bg-muted/50 px-4 py-4 print:bg-white print:p-0">
      <style>{"@page { size: A4; margin: 12mm }"}</style>
      <div className="mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <span className="text-2xs text-muted-foreground">پیش‌نمایش چاپ؛ در پنجره‌ی چاپ می‌توانید «ذخیره به‌صورت PDF» را هم انتخاب کنید.</span>
        <Button onClick={() => window.print()}>
          <Printer /> چاپ
        </Button>
      </div>
      <article className="mx-auto flex max-w-[210mm] flex-col gap-4 rounded-md border bg-background p-4 text-foreground shadow-sm sm:p-[12mm] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {children(printedAt)}
      </article>
    </main>
  )
}

/** سربرگ برگه‌ی چاپ: لوگو و نام سازمان، عنوان، شماره و تاریخ. */
export function PrintHeader({ title, number, date }: { title: string; number?: string | null; date?: string }) {
  const { name: orgName, logoUrl } = useBranding()
  return (
    <header className="flex items-center gap-4 border-b-2 border-foreground pb-3">
      {logoUrl && <img src={logoUrl} alt={`لوگوی ${orgName}`} className="size-16 shrink-0 object-contain" />}
      <div className="min-w-0 flex-1">
        {orgName && <p className="text-xs font-semibold">{orgName}</p>}
        <h1 className="text-base font-bold">{title}</h1>
      </div>
      <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">شماره:</dt>
        <dd className="tabular-nums">{number ? toFaDigits(number) : "—"}</dd>
        <dt className="text-muted-foreground">تاریخ:</dt>
        <dd className="tabular-nums">{date || "—"}</dd>
      </dl>
    </header>
  )
}

