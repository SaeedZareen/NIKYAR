import * as React from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"
import { useBranding } from "@/app/branding"
import { REQUESTS_KEY } from "@/app/workflow"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { FormSummary } from "@/components/form-renderer/value-view"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { fileUrl } from "@/lib/files"
import { formatDateTime, toFaDigits } from "@/lib/format"

/** برگه‌ی چاپ درخواست (A4، بی پوسته‌ی برنامه): سربرگ سازمان، اطلاعات درخواست، و تأییدها با امضای «حساب من» هر تأییدکننده. */
export default function RequestPrintPage() {
  const id = useParams().id ?? ""
  const [params] = useSearchParams()
  const { name: orgName, logoUrl } = useBranding()
  const query = useQuery({ queryKey: [...REQUESTS_KEY, "track", id], queryFn: () => unwrap(api.GET("/api/workflow/requests/{id}/track/", { params: { path: { id: Number(id) } } })) })
  const r = query.data
  const [printedAt] = React.useState(() => new Date())

  // کاغذ همیشه روشن است، حتی وقتی برنامه در حالت تیره است (این صفحه در زبانه‌ی جداگانه باز می‌شود)
  React.useEffect(() => {
    const root = document.documentElement
    const dark = root.classList.contains("dark")
    root.classList.remove("dark")
    return () => void (dark && root.classList.add("dark"))
  }, [])

  React.useEffect(() => {
    if (r) document.title = `${r.process_title}${r.number ? ` ${toFaDigits(r.number)}` : ""}`
  }, [r])

  // پنجره‌ی چاپ پس از رسیدن داده و بارگذاری تصویرها (لوگو و امضاها)
  const auto = params.get("print") === "1"
  React.useEffect(() => {
    if (!r || !auto) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))))
      if (!cancelled) window.print()
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [r, auto])

  if (!r) {
    return (
      <main className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 p-4">
        <h1 className="sr-only">چاپ درخواست</h1>
        {query.error ? <p className="text-xs text-destructive">{errorMessage(query.error)}</p> : <Skeleton className="h-96 w-full" />}
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
        <header className="flex items-center gap-4 border-b-2 border-foreground pb-3">
          {logoUrl && <img src={logoUrl} alt={`لوگوی ${orgName}`} className="size-16 shrink-0 object-contain" />}
          <div className="min-w-0 flex-1">
            {orgName && <p className="text-xs font-semibold">{orgName}</p>}
            <h1 className="text-base font-bold">{r.process_title}</h1>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">شماره:</dt>
            <dd className="tabular-nums">{r.number ? toFaDigits(r.number) : "—"}</dd>
            <dt className="text-muted-foreground">تاریخ:</dt>
            <dd className="tabular-nums">{r.submitted_at ? formatDateTime(r.submitted_at) : "—"}</dd>
          </dl>
        </header>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">درخواست‌دهنده:</dt>
            <dd>{r.requester_name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">وضعیت:</dt>
            <dd>{r.status_label}</dd>
          </div>
        </dl>
        <FormSummary definition={r.definition as FormDefinition} data={r.data} title="اطلاعات درخواست" submitted />
        <section aria-label="تأییدها" className="flex flex-col gap-2 break-inside-avoid">
          <h2 className="text-sm font-bold">تأییدها</h2>
          {r.approvals.length === 0 ? (
            <p className="text-xs text-muted-foreground">هنوز مرحله‌ای تصمیم نگرفته است.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b">
                  <th className="py-1 text-start font-semibold">مرحله</th>
                  <th className="py-1 text-start font-semibold">تصمیم</th>
                  <th className="py-1 text-start font-semibold">زمان</th>
                  <th className="py-1 text-start font-semibold">امضا</th>
                </tr>
              </thead>
              <tbody>
                {r.approvals.map((a, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="py-1.5">{a.step}</td>
                    <td className="py-1.5">
                      {a.decision}
                      {a.comment && <p className="text-2xs text-muted-foreground">{a.comment}</p>}
                    </td>
                    <td className="py-1.5 tabular-nums">{formatDateTime(a.at)}</td>
                    <td className="py-1.5">
                      <div className="flex flex-col items-start gap-0.5">
                        {a.signature ? <img src={`${fileUrl(a.signature)}?inline=1`} alt={`امضای ${a.actor}`} className="h-10 object-contain" /> : null}
                        <span>
                          {a.actor}
                          {a.on_behalf_of && <span className="text-2xs text-muted-foreground"> (به نیابت از {a.on_behalf_of})</span>}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <footer className="mt-4 text-2xs text-muted-foreground">چاپ‌شده در {formatDateTime(printedAt)}</footer>
      </article>
    </main>
  )
}
