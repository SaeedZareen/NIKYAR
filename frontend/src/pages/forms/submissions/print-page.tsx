import * as React from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"
import { useBranding } from "@/app/branding"
import { SUBMISSIONS_KEY } from "@/app/forms"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { fileUrl } from "@/lib/files"
import { formatDateTime, toFaDigits } from "@/lib/format"
import { submissionInfo } from "./links"
import { SubmissionSummary, type SubmissionDetail } from "./submission-summary"

/** امضای «حساب من» نخستین فیلد امضای ثبت، برای پای برگه. */
function signatureOf(s: SubmissionDetail): string | null {
  const definition = s.context.definition as FormDefinition
  const field = definition.sections.flatMap((x) => x.fields).find((f) => f.type === "signature" && typeof s.data[f.id] === "string")
  return field ? String(s.data[field.id]) : null
}

/** برگه‌ی چاپ ثبت (A4، بی پوسته‌ی برنامه): سربرگ و لوگوی سازمان، شماره و تاریخ شمسی، مقدارها و امضای ثبت‌کننده. */
export default function SubmissionPrintPage() {
  const id = useParams().id ?? ""
  const [params] = useSearchParams()
  const { name: orgName, logoUrl } = useBranding()
  const query = useQuery({ queryKey: [...SUBMISSIONS_KEY, "detail", id], queryFn: () => unwrap(api.GET("/api/forms/submissions/{id}/", { params: { path: { id: Number(id) } } })) })
  const s = query.data
  const [printedAt] = React.useState(() => new Date())

  // کاغذ همیشه روشن است، حتی وقتی برنامه در حالت تیره است (این صفحه در زبانه‌ی جداگانه باز می‌شود)
  React.useEffect(() => {
    const root = document.documentElement
    const dark = root.classList.contains("dark")
    root.classList.remove("dark")
    return () => void (dark && root.classList.add("dark"))
  }, [])

  React.useEffect(() => {
    if (s) document.title = `${s.form_title}${s.number ? ` ${toFaDigits(s.number)}` : ""}`
  }, [s])

  // پنجره‌ی چاپ پس از رسیدن نام‌ها و بارگذاری تصویرها (لوگو و امضا)
  const auto = params.get("print") === "1"
  React.useEffect(() => {
    if (!s || !auto) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))))
      if (!cancelled) window.print()
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [s, auto])

  if (!s) {
    return (
      <main className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 p-4">
        <h1 className="sr-only">چاپ ثبت</h1>
        {query.error ? <p className="text-xs text-destructive">{errorMessage(query.error)}</p> : <Skeleton className="h-96 w-full" />}
      </main>
    )
  }
  const signature = signatureOf(s)
  return (
    <main className="min-h-svh bg-muted/50 px-4 py-4 print:bg-white print:p-0">
      <style>{"@page { size: A4; margin: 12mm }"}</style>
      <div className="mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <span className="text-2xs text-muted-foreground">پیش‌نمایش چاپ؛ در پنجره‌ی چاپ می‌توانید «ذخیره به‌صورت PDF» را هم انتخاب کنید.</span>
        <Button onClick={() => window.print()}>
          <Printer /> چاپ
        </Button>
      </div>
      <article className="mx-auto flex max-w-[210mm] flex-col gap-4 rounded-md border bg-background p-4 text-foreground sm:p-[12mm] shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-center gap-4 border-b-2 border-foreground pb-3">
          {logoUrl && <img src={logoUrl} alt={`لوگوی ${orgName}`} className="size-16 shrink-0 object-contain" />}
          <div className="min-w-0 flex-1">
            {orgName && <p className="text-xs font-semibold">{orgName}</p>}
            <h1 className="text-base font-bold">{s.form_title}</h1>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">شماره:</dt>
            <dd className="tabular-nums">{s.number ? toFaDigits(s.number) : "—"}</dd>
            <dt className="text-muted-foreground">تاریخ:</dt>
            <dd className="tabular-nums">{s.submitted_at ? formatDateTime(s.submitted_at) : "—"}</dd>
          </dl>
        </header>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {submissionInfo(s)
            .filter((i) => i.label !== "شماره" && i.label !== "زمان ثبت")
            .map((i) => (
              <div key={i.label} className="flex gap-2">
                <dt className="text-muted-foreground">{i.label}:</dt>
                <dd>{i.value}</dd>
              </div>
            ))}
        </dl>
        <SubmissionSummary submission={s} />
        <footer className="mt-6 flex items-end justify-between gap-6 break-inside-avoid">
          <span className="text-2xs text-muted-foreground">چاپ‌شده در {formatDateTime(printedAt)}</span>
          <div className="flex w-48 flex-col items-center gap-1 text-xs">
            {signature ? <img src={`${fileUrl(signature)}?inline=1`} alt="امضای ثبت‌کننده" className="h-16 object-contain" /> : <span className="h-16" />}
            <span className="w-full border-t border-foreground pt-1 text-center">
              امضای ثبت‌کننده{s.created_by !== null && `: ${s.created_by_name}`}
            </span>
          </div>
        </footer>
      </article>
    </main>
  )
}
