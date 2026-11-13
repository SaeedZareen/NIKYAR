import { useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { SUBMISSIONS_KEY } from "@/app/forms"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { PrintHeader, PrintSheet } from "@/components/print-sheet"
import { api, unwrap } from "@/lib/api/client"
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
  const query = useQuery({ queryKey: [...SUBMISSIONS_KEY, "detail", id], queryFn: () => unwrap(api.GET("/api/forms/submissions/{id}/", { params: { path: { id: Number(id) } } })) })
  const s = query.data
  return (
    <PrintSheet ready={!!s} error={query.error} loadingLabel="چاپ ثبت" title={s ? `${s.form_title}${s.number ? ` ${toFaDigits(s.number)}` : ""}` : undefined}>
      {(printedAt) => s && <SubmissionSheet s={s} printedAt={printedAt} />}
    </PrintSheet>
  )
}

function SubmissionSheet({ s, printedAt }: { s: SubmissionDetail; printedAt: string }) {
  const signature = signatureOf(s)
  return (
    <>
      <PrintHeader title={s.form_title} number={s.number} date={s.submitted_at ? formatDateTime(s.submitted_at) : undefined} />
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
        <span className="text-2xs text-muted-foreground">چاپ‌شده در {printedAt}</span>
        <div className="flex w-48 flex-col items-center gap-1 text-xs">
          {signature ? <img src={`${fileUrl(signature)}?inline=1`} alt="امضای ثبت‌کننده" className="h-16 object-contain" /> : <span className="h-16" />}
          <span className="w-full border-t border-foreground pt-1 text-center">امضای ثبت‌کننده{s.created_by !== null && `: ${s.created_by_name}`}</span>
        </div>
      </footer>
    </>
  )
}
