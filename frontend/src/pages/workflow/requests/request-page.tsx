import * as React from "react"
import { useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Ban, Printer } from "lucide-react"
import { toast } from "sonner"
import { useTheme } from "@/components/theme-provider"
import { REQUEST_TONES, REQUESTS_KEY } from "@/app/workflow"
import { PageError, PageFallback } from "@/app/route-states"
import { StaticField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { FormSummary } from "@/components/form-renderer/value-view"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"
import { ProcessCanvas } from "@/pages/workflow/design/process-canvas"
import { ManageSection } from "@/pages/workflow/manage/manage-section"
import { Discussion } from "@/pages/workflow/tasks/discussion"
import { History } from "@/pages/workflow/tasks/history"

type Track = Schemas["RequestTrack"]

/** صفحه‌ی درخواست: وضعیت و مرحله‌ی فعلی، نمودار با مرحله‌های انجام‌شده و جاری، اطلاعات فرم، گفت‌وگو و تاریخچه؛ لغو و چاپ. */
export default function RequestPage() {
  const { requestId } = useParams()
  const key = [...REQUESTS_KEY, "track", requestId]
  const track = useQuery({ queryKey: key, queryFn: () => unwrap(api.GET("/api/workflow/requests/{id}/track/", { params: { path: { id: Number(requestId) } } })) })
  if (track.isPending) return <PageFallback />
  if (track.error) return <PageError error={track.error} onRetry={() => track.refetch()} />
  return <RequestView data={track.data} queryKey={key} />
}

function RequestView({ data, queryKey }: { data: Track; queryKey: unknown[] }) {
  const qc = useQueryClient()
  const { resolvedTheme } = useTheme()
  const [cancelling, setCancelling] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const cancel = useMutation({
    mutationFn: () => unwrap(api.POST("/api/workflow/requests/{id}/cancel/", { params: { path: { id: data.id } }, body: { reason } })),
    onSuccess: (next) => {
      qc.setQueryData(queryKey, next)
      qc.invalidateQueries({ queryKey: REQUESTS_KEY })
      setCancelling(false)
      toast.success("درخواست لغو شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const title = data.number ? `${data.process_title} · ${toFaDigits(data.number)}` : data.process_title

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: "درخواست‌های من", to: "/requests" }]}
        meta={<StatusBadge tone={REQUEST_TONES[data.status] ?? "neutral"}>{data.status_label}</StatusBadge>}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/print/requests/${data.id}?print=1`} target="_blank" rel="noreferrer">
                <Printer /> چاپ
              </a>
            </Button>
            {data.can_cancel && !data.can_manage && (
              <Button variant="outline" className="text-destructive" onClick={() => setCancelling(true)}>
                <Ban /> لغو درخواست
              </Button>
            )}
          </>
        }
      />
      <Section title="وضعیت">
        <FormGrid>
          <StaticField label="درخواست‌دهنده">{data.requester_name}</StaticField>
          {data.created_by_name && data.created_by !== data.requester && <StaticField label="ثبت‌کننده">{data.created_by_name}</StaticField>}
          <StaticField label="زمان ثبت">
            <span className="tabular-nums">{formatDateTime(data.submitted_at)}</span>
          </StaticField>
          {data.finished_at && (
            <StaticField label="زمان پایان">
              <span className="tabular-nums">{formatDateTime(data.finished_at)}</span>
            </StaticField>
          )}
        </FormGrid>
        {data.waiting.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5" aria-label="مرحله‌های منتظر">
            {data.waiting.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-xs">
                <span className="font-medium">{t.title}</span>
                <span className="text-muted-foreground">نزد {t.candidates.join("، ")}</span>
                {t.due_at && <span className="text-2xs text-muted-foreground tabular-nums">مهلت: {formatDateTime(t.due_at)}</span>}
                {t.overdue && <StatusBadge tone="destructive">دیرکرد</StatusBadge>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {data.can_manage && <ManageSection data={data} queryKey={queryKey} />}
      <Section title="نمودار فرایند" description="مرحله‌های انجام‌شده سبز و مرحله‌ی فعلی با رنگ اصلی و کادر ضخیم نشان داده می‌شوند." contentClassName="p-0">
        <ProcessCanvas key={resolvedTheme} xml={data.bpmn} readOnly problems={{}} highlights={{ done: data.done, active: data.active }} label="نمودار درخواست" className="h-80" />
      </Section>
      <FormSummary definition={data.definition as FormDefinition} data={data.data} title="اطلاعات درخواست" submitted />
      <Discussion requestId={data.id} />
      <History rows={data.history} />
      <Dialog open={cancelling} onOpenChange={(o) => !cancel.isPending && setCancelling(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>لغو درخواست</DialogTitle>
            <DialogDescription>درخواست «{title}» لغو و کار آن از کارتابل گیرنده‌ها برداشته می‌شود. این کار بازگشت ندارد.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="cancel-reason">دلیل (اختیاری)</FieldLabel>
            <Textarea id="cancel-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(false)} disabled={cancel.isPending}>
              انصراف
            </Button>
            <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              لغو درخواست
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
