import { useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { REQUESTS_KEY } from "@/app/workflow"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { FormSummary } from "@/components/form-renderer/value-view"
import { PrintHeader, PrintSheet } from "@/components/print-sheet"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { fileUrl } from "@/lib/files"
import { formatDateTime, toFaDigits } from "@/lib/format"

/** برگه‌ی چاپ درخواست (A4، بی پوسته‌ی برنامه): سربرگ سازمان، اطلاعات درخواست، و تأییدها با امضای «حساب من» هر تأییدکننده. */
export default function RequestPrintPage() {
  const id = useParams().id ?? ""
  const query = useQuery({
    queryKey: [...REQUESTS_KEY, "track", id],
    queryFn: () => unwrap(api.GET("/api/workflow/requests/{id}/track/", { params: { path: { id: Number(id) } } })),
  })
  const r = query.data
  return (
    <PrintSheet ready={!!r} error={query.error} loadingLabel="چاپ درخواست" title={r ? `${r.process_title}${r.number ? ` ${toFaDigits(r.number)}` : ""}` : undefined}>
      {(printedAt) => r && <RequestSheet r={r} printedAt={printedAt} />}
    </PrintSheet>
  )
}

function RequestSheet({ r, printedAt }: { r: Schemas["RequestTrack"]; printedAt: string }) {
  return (
    <>
      <PrintHeader title={r.process_title} number={r.number} date={r.submitted_at ? formatDateTime(r.submitted_at) : undefined} />
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
      <footer className="mt-4 text-2xs text-muted-foreground">چاپ‌شده در {printedAt}</footer>
    </>
  )
}
