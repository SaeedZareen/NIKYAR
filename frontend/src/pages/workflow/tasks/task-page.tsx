import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { useForm, useWatch } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Hand, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { TASKS_KEY } from "@/app/workflow"
import { useAuth } from "@/app/auth"
import { PageError, PageFallback } from "@/app/route-states"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Discussion } from "./discussion"
import { ErrorSummary } from "@/components/form/error-summary"
import { StaticField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { applyServerErrors } from "@/components/form/server-errors"
import { fieldLabels, screenKey, toFormValues, toPayload, type FormDefinition, type FormValues } from "@/components/form-renderer/definition"
import { FormRenderer } from "@/components/form-renderer/form-renderer"
import { applyRules } from "@/components/form-renderer/rules"
import { formResolver, type JsonSchema } from "@/components/form-renderer/validate"
import { FormSummary } from "@/components/form-renderer/value-view"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber, toFaDigits } from "@/lib/format"

type Task = Schemas["TaskDetail"]
type Decision = Task["detail"]["decisions"][number]

/** صفحه‌ی انجام کار: خلاصه‌ی درخواست، فرم با دسترسی همین مرحله، تصمیم با یادداشت، برداشتن کار گروهی و تاریخچه. */
export default function TaskPage() {
  const { taskId } = useParams()
  const task = useQuery({
    queryKey: [...TASKS_KEY, "task", taskId],
    queryFn: () =>
      unwrap(
        api.GET("/api/workflow/tasks/{id}/", {
          params: { path: { id: Number(taskId) } },
        })
      ),
  })
  if (task.isPending) return <PageFallback />
  if (task.error) return <PageError error={task.error} onRetry={() => task.refetch()} />
  // پس از برداشتن، رها کردن یا انجام، فرم با زمینه‌ی تازه از نو ساخته می‌شود
  return <TaskView key={`${task.data.id}-${task.data.status}-${task.data.claimed_by_name}`} task={task.data} />
}

function TaskView({ task }: { task: Task }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { detail } = task
  const definition = detail.definition as FormDefinition
  const refresh = (next: Task) => {
    qc.setQueryData([...TASKS_KEY, "task", String(task.id)], next)
    qc.invalidateQueries({ queryKey: [...TASKS_KEY, "box"] })
    qc.invalidateQueries({ queryKey: [...TASKS_KEY, "counts"] })
  }
  const claim = useMutation({
    mutationFn: (kind: "claim" | "release") =>
      unwrap(
        kind === "claim"
          ? api.POST("/api/workflow/tasks/{id}/claim/", {
              params: { path: { id: task.id } },
            })
          : api.POST("/api/workflow/tasks/{id}/release/", {
              params: { path: { id: task.id } },
            })
      ),
    onSuccess: (next, kind) => {
      refresh(next)
      toast.success(kind === "claim" ? "کار را برداشتید؛ تا انجام یا رها کردن، فقط برای شماست." : "کار به گروه برگشت.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const open = task.status === "open"
  const request = detail.request
  const actions = (
    <>
      {detail.can_claim && (
        <Button variant="outline" disabled={claim.isPending} onClick={() => claim.mutate("claim")}>
          <Hand /> برداشتن کار
        </Button>
      )}
      {detail.can_release && (
        <Button variant="ghost" disabled={claim.isPending} onClick={() => claim.mutate("release")}>
          <Undo2 /> رها کردن
        </Button>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={task.title}
        breadcrumbs={[{ label: "کارتابل", to: "/tasks" }]}
        meta={[request.process_title, request.number ? `شماره‌ی ${toFaDigits(request.number)}` : "", task.status_label].filter(Boolean).join(" · ")}
        actions={actions}
      />
      {open && !detail.can_act && (
        <Alert>
          <AlertDescription>
            {detail.voted
              ? "نظر شما ثبت شد؛ کار منتظر نظر دیگر گیرنده‌هاست."
              : task.claimed_by_name
                ? `این کار را ${task.claimed_by_name} برداشته است؛ فقط می‌توانید آن را ببینید.`
                : detail.can_claim
                  ? ""
                  : "شما گیرنده‌ی این کار نیستید؛ فقط می‌توانید آن را ببینید."}
          </AlertDescription>
        </Alert>
      )}
      {detail.can_act && detail.on_behalf_of && (
        <Alert>
          <AlertDescription>این کار را به‌جای {detail.on_behalf_of} (جانشینی) انجام می‌دهید.</AlertDescription>
        </Alert>
      )}
      <Section
        title="درخواست"
        meta={<StatusBadge tone={request.status === "running" ? "info" : request.status === "completed" ? "success" : "neutral"}>{request.status_label}</StatusBadge>}
      >
        <FormGrid>
          <StaticField label="فرایند">{request.process_title}</StaticField>
          <StaticField label="شماره">
            <span className="tabular-nums">{request.number ? toFaDigits(request.number) : "—"}</span>
          </StaticField>
          <StaticField label="درخواست‌دهنده">{request.requester_name}</StaticField>
          {request.created_by_name && <StaticField label="ثبت‌کننده">{request.created_by_name}</StaticField>}
          <StaticField label="زمان ارسال">
            <span className="tabular-nums">{formatDateTime(request.submitted_at)}</span>
          </StaticField>
          <StaticField label="رسیدن این کار">
            <span className="tabular-nums">{formatDateTime(task.created_at)}</span>
          </StaticField>
          {detail.group && <StaticField label="گیرنده‌ها">{detail.candidates.join("، ")}</StaticField>}
        </FormGrid>
      </Section>
      {detail.completion === "all" && <Votes votes={detail.votes} />}
      {detail.can_act ? (
        <ActForm task={task} definition={definition} onDone={() => navigate("/tasks")} />
      ) : (
        <>
          <FormSummary definition={definition} data={detail.data} title={request.process_title} submitted />
          {task.status === "done" && (
            <Section title="تصمیم">
              <FormGrid>
                <StaticField label="تصمیم">{task.decision_label}</StaticField>
                <StaticField label="زمان انجام">
                  <span className="tabular-nums">{formatDateTime(task.completed_at)}</span>
                </StaticField>
                {task.comment && <StaticField label="یادداشت">{task.comment}</StaticField>}
              </FormGrid>
            </Section>
          )}
        </>
      )}
      <Discussion requestId={request.id} />
      <History rows={detail.history} />
    </div>
  )
}

/** فرم مرحله و دکمه‌های تصمیم: اعتبارسنجی فرم، سپس پنجره‌ی تأیید تصمیم. */
function ActForm({ task, definition, onDone }: { task: Task; definition: FormDefinition; onDone: () => void }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const me = React.useMemo(() => (user ? { id: user.id, unitId: user.assignment?.unit_id } : undefined), [user])
  const defaults = React.useMemo(() => toFormValues(definition, task.detail.data, me), [definition, task.detail.data, me])
  const form = useForm<FormValues>({
    resolver: formResolver(definition, task.detail.schema as JsonSchema),
    defaultValues: defaults,
    mode: "onTouched",
    shouldFocusError: false,
  })
  const values = useWatch({ control: form.control })
  const { state: rules } = React.useMemo(() => applyRules(definition, toPayload(definition, values as FormValues)), [definition, values])
  const [comment, setComment] = React.useState("")
  const [commentError, setCommentError] = React.useState("")
  const [chosen, setChosen] = React.useState<{
    decision: Decision
    values: FormValues
  } | null>(null)
  const commentId = React.useId()

  const complete = useMutation({
    mutationFn: ({ decision, values }: { decision: Decision; values: FormValues }) =>
      unwrap(
        api.POST("/api/workflow/tasks/{id}/complete/", {
          params: { path: { id: task.id } },
          body: {
            decision: decision.value,
            comment,
            data: applyRules(definition, toPayload(definition, values)).values,
          },
        })
      ),
    onSuccess: (next, { decision }) => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      toast.success(next.status === "open" ? `نظر «${decision.label}» ثبت شد؛ کار منتظر نظر دیگر گیرنده‌هاست.` : `«${decision.label}» برای «${task.title}» ثبت شد.`)
      onDone()
    },
    onError: (e, { values }) => {
      setChosen(null)
      if (e instanceof ApiError && e.fields.comment) setCommentError(e.fields.comment)
      else applyServerErrors(form, e, (name) => screenKey(definition, values, name))
    },
  })

  const pick = (decision: Decision) => {
    setCommentError("")
    if (decision.comment === "required" && !comment.trim()) {
      setCommentError(`برای «${decision.label}» نوشتن یادداشت الزامی است.`)
      document.getElementById(commentId)?.focus()
      return
    }
    void form.handleSubmit((v) => setChosen({ decision, values: v }))()
  }
  const hasFields = definition.sections.some((s) => s.fields.length > 0)

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-4">
      <ErrorSummary errors={form.formState.errors} labels={fieldLabels(definition)} submitCount={form.formState.submitCount} />
      {hasFields && <FormRenderer definition={definition} title={task.detail.request.process_title} control={form.control} rules={rules} />}
      <Section
        title="تصمیم"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {task.detail.decisions.map((d, i) => (
              <Button key={d.value} type="button" variant={i === 0 ? "default" : "outline"} disabled={complete.isPending} onClick={() => pick(d)}>
                {d.label}
              </Button>
            ))}
          </div>
        }
      >
        {/* همان چیدمان «برچسب کنار» فیلدهای فرم */}
        <Field data-invalid={!!commentError} className="md:grid md:grid-cols-[8rem_minmax(0,1fr)] md:items-start md:gap-x-3">
          <FieldLabel htmlFor={commentId} className="md:min-h-7 md:pt-1">
            یادداشت
          </FieldLabel>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Textarea
              id={commentId}
              rows={3}
              maxLength={2000}
              value={comment}
              aria-invalid={!!commentError}
              onChange={(e) => {
                setComment(e.target.value)
                setCommentError("")
              }}
            />
            {commentError && <FieldError>{commentError}</FieldError>}
          </div>
        </Field>
      </Section>
      <ConfirmDialog
        open={!!chosen}
        onOpenChange={(o) => !o && setChosen(null)}
        title={chosen ? `«${chosen.decision.label}»` : ""}
        description={chosen ? `تصمیم «${chosen.decision.label}» برای «${task.title}» ثبت و درخواست به مرحله‌ی بعد فرستاده شود؟ پس از ثبت قابل تغییر نیست.` : ""}
        confirmLabel={chosen ? `ثبت «${chosen.decision.label}»` : ""}
        onConfirm={() => (chosen ? complete.mutateAsync(chosen).then(() => undefined) : Promise.resolve())}
      />
    </form>
  )
}

/** «همه‌ی گیرنده‌ها»: نظر هر گیرنده یا «منتظر نظر». */
function Votes({ votes }: { votes: Task["detail"]["votes"] }) {
  const given = votes.filter((v) => v.decision).length
  return (
    <Section
      title="نظر گیرنده‌ها"
      description="این مرحله نظر همه‌ی گیرنده‌ها را می‌خواهد؛ تصمیمی غیر از تصمیم نخست (مثلاً «رد») همان‌جا کار را تمام می‌کند."
      meta={`${formatNumber(given)} از ${formatNumber(votes.length)} نظر`}
    >
      <ul className="flex flex-col gap-1.5">
        {votes.map((v) => (
          <li key={v.candidate} className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="font-medium">{v.candidate}</span>
            {v.decision ? <StatusBadge tone="success">{v.decision}</StatusBadge> : <StatusBadge tone="neutral">منتظر نظر</StatusBadge>}
            {v.actor && <span className="text-2xs text-muted-foreground">(جانشین: {v.actor})</span>}
            {v.at && <span className="text-2xs text-muted-foreground tabular-nums">{formatDateTime(v.at)}</span>}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function History({ rows }: { rows: Task["detail"]["history"] }) {
  return (
    <Section title="تاریخچه" meta={`${formatNumber(rows.length)} رویداد`}>
      <ol className="flex flex-col gap-3">
        {rows.map((h, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-s-2 border-border ps-3">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-medium">{h.step ? `${h.step}: ${h.decision || h.kind_label}` : h.kind_label}</span>
              {h.actor && (
                <span>
                  {h.actor}
                  {h.on_behalf_of && <span className="text-muted-foreground"> (به نیابت از {h.on_behalf_of})</span>}
                </span>
              )}
            </div>
            <span className="text-2xs text-muted-foreground tabular-nums">{formatDateTime(h.at)}</span>
            {h.comment && <p className="text-xs whitespace-pre-line">{h.comment}</p>}
          </li>
        ))}
      </ol>
    </Section>
  )
}
