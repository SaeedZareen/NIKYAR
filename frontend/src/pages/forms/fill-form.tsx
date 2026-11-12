import * as React from "react"
import { useNavigate } from "react-router"
import { useForm, useWatch } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, CircleSlash, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ErrorSummary } from "@/components/form/error-summary"
import { applyServerErrors } from "@/components/form/server-errors"
import { UnsavedChangesGuard } from "@/components/form/unsaved-changes-guard"
import { fieldLabels, screenKey, toFormValues, toPayload, type FormDefinition, type FormValues } from "@/components/form-renderer/definition"
import { FormRenderer } from "@/components/form-renderer/form-renderer"
import { StepHeader } from "@/components/form-renderer/form-steps"
import { useFormSteps } from "@/components/form-renderer/use-form-steps"
import { applyRules } from "@/components/form-renderer/rules"
import { formResolver, validate, type JsonSchema } from "@/components/form-renderer/validate"
import { PageHeader } from "@/components/layout/page-header"
import { RichTextView } from "@/components/rich-text"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber, toFaDigits } from "@/lib/format"
import { useAuth } from "@/app/auth"
import { Confirmation, type Confirmed } from "./confirmation"
import { ReviewDialog } from "./review-dialog"

type Full = Schemas["FillContext"]
/** زمینه‌ی پر کردن؛ درخواست فرایند تنظیمات پذیرش فرم (ظرفیت، پیش‌نویس، پس از ثبت) را ندارد و پیش‌فرض‌ها به کار می‌رود. */
export type FillContextLike = Pick<Full, "title" | "description" | "definition" | "schema" | "draft_schema"> &
  Partial<Pick<Full, "availability" | "allow_drafts" | "after_submit" | "after_submit_url" | "edit_hours">>
const AUTOSAVE_DELAY = 1500

/**
 * مقصد پر کردن: فرم مستقل (ثبت فرم) یا درخواست فرایند. پرکننده یکی است؛ ذخیره، ارسال و حذف پیش‌نویس از این‌جا.
 */
export type FillTarget = {
  save: (id: number | null, data: Record<string, unknown>, submit: boolean) => Promise<Confirmed & { updated_at: string }>
  remove: (id: number) => Promise<unknown>
  /** پس از ثبت یا حذف (تازه کردن فهرست‌ها) */
  invalidate: () => void
  back: { label: string; to: string }
  /** نشانی «ثبت دوباره» و (در مهلت ویرایش) «ویرایش ثبت» در صفحه‌ی تأیید */
  againUrl: string
  editUrl?: (id: number) => string
  /** متن نوار پس از ثبت (وقتی صفحه‌ی تأیید نیست) */
  submittedMessage: (saved: Confirmed) => string
}

type SaveState = { kind: "idle" | "saving" | "saved" | "invalid" | "error"; at?: string | null; message?: string }

type FillProps = {
  context: FillContextLike
  target: FillTarget
  /** بالای فرم (مثلاً «ثبت به نام دیگری») */
  before?: React.ReactNode
  /** ثبت نهایی‌ای که در مهلت ویرایش، ویرایش می‌شود */
  editing: (Confirmed & { editable_until?: string | null }) | null
  initialData?: Record<string, unknown>
  initialSubmission: number | null
  initialSavedAt: string | null
  onCreated: (id: number) => void
}

export function FillForm({ context, target, before, editing, initialData, initialSubmission, initialSavedAt, onCreated }: FillProps) {
  const navigate = useNavigate()
  const definition = context.definition as FormDefinition
  const schema = context.schema as JsonSchema
  const draftSchema = context.draft_schema as JsonSchema
  const { user } = useAuth()
  const me = React.useMemo(
    () =>
      user
        ? {
            id: user.id,
            unitId: user.assignment?.unit_id,
            profile: { full_name: user.full_name, first_name: user.first_name, last_name: user.last_name, username: user.username, mobile: user.mobile, email: user.email },
          }
        : undefined,
    [user]
  )
  // پارامترهای نشانی صفحه برای فیلدهای پنهان (مثلاً ?src=sms)؛ فقط هنگام باز شدن فرم
  const [query] = React.useState(() => new URLSearchParams(window.location.search))
  const defaults = React.useMemo(() => toFormValues(definition, initialData, me, query), [definition, initialData, me, query])
  const form = useForm<FormValues>({ resolver: formResolver(definition, schema), defaultValues: defaults, mode: "onTouched", shouldFocusError: false })
  const values = useWatch({ control: form.control })

  // شناسه‌ی ثبت در ref برای درخواست‌های زنجیره‌ای و در state برای نمایش (دکمه‌ی حذف پیش‌نویس).
  const submission = React.useRef<number | null>(initialSubmission)
  const [submissionId, setSubmissionId] = React.useState(initialSubmission)
  const [lastSaved, setLastSaved] = React.useState(() => JSON.stringify(applyRules(definition, toPayload(definition, defaults)).values))
  const pending = React.useRef<Promise<unknown>>(Promise.resolve())
  const [save, setSave] = React.useState<SaveState>(initialSavedAt ? { kind: "saved", at: initialSavedAt } : { kind: "idle" })
  const [submitting, setSubmitting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [done, setDone] = React.useState<Confirmed | null>(null)

  // قاعده‌ها زنده: فیلدهای پنهان در داده‌ی ارسالی نمی‌آیند (مقدارشان در فرم می‌ماند تا اگر دوباره دیده شدند، از دست نرود).
  const { values: payload, state: rules } = React.useMemo(() => applyRules(definition, toPayload(definition, values as FormValues)), [definition, values])
  const serialized = JSON.stringify(payload)
  const changed = serialized !== lastSaved

  /** ذخیره‌ی پیش‌نویس یا ثبت نهایی؛ درخواست‌ها پشت سر هم اجرا می‌شوند تا ترتیب ذخیره‌ها به هم نریزد. */
  const send = React.useCallback(
    (body: Record<string, unknown>, submit: boolean) => {
      const run = pending.current.then(async () => {
        const id = submission.current
        const result = await target.save(id, body, submit)
        if (!id) {
          submission.current = result.id
          setSubmissionId(result.id)
          if (!submit) onCreated(result.id)
        }
        setLastSaved(JSON.stringify(body))
        return result
      })
      pending.current = run.catch(() => undefined)
      return run
    },
    [target, onCreated]
  )

  // ذخیره‌ی خودکار پیش‌نویس، کمی پس از آخرین تغییر؛ فقط اگر داده با طرح پیش‌نویس درست باشد.
  // بی‌پیش‌نویس: فرمی که پیش‌نویس نمی‌پذیرد، یا ویرایش ثبت نهایی (که فقط با «ذخیره‌ی تغییرات» ذخیره می‌شود)
  const autosave = (context.allow_drafts ?? true) && !editing
  React.useEffect(() => {
    if (!autosave || !changed || submitting) return
    const timer = window.setTimeout(() => {
      const body = JSON.parse(serialized) as Record<string, unknown>
      if (Object.keys(validate(draftSchema, body)).length > 0) {
        setSave({ kind: "invalid" })
        return
      }
      if (!submission.current && Object.keys(body).length === 0) return
      setSave({ kind: "saving" })
      send(body, false).then(
        (r) => setSave({ kind: "saved", at: r.updated_at }),
        (e) => setSave({ kind: "error", message: errorMessage(e) })
      )
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [autosave, changed, serialized, submitting, draftSchema, send])

  // ثبت نهایی دو گام دارد: پس از اعتبارسنجی، مرور اطلاعات در پنجره و «تأیید و ثبت»
  const [review, setReview] = React.useState<FormValues | null>(null)
  const submitValid = (formValues: FormValues) => setReview(formValues)
  const confirmSubmit = async (formValues: FormValues) => {
    setSubmitting(true)
    try {
      const saved = await send(applyRules(definition, toPayload(definition, formValues)).values, true)
      target.invalidate()
      // پس از ثبت: صفحه‌ی تأیید، رفتن به نشانی، یا بازگشت به «فرم‌ها» (تنظیمات فرم)
      if ((context.after_submit ?? "page") === "page") {
        setDone(saved)
        window.scrollTo({ top: 0 })
        return
      }
      toast.success(editing ? `تغییرهای ثبت «${context.title}» ذخیره شد.` : target.submittedMessage(saved))
      if (context.after_submit === "url" && context.after_submit_url) window.location.assign(context.after_submit_url)
      else navigate(target.back.to)
    } catch (e) {
      setReview(null)
      applyServerErrors(form, e, (name) => screenKey(definition, formValues, name))
      setSubmitting(false)
    }
  }
  const steps = useFormSteps(definition, rules, form, context.title)
  // در فرم مرحله‌ای، Enter یا دکمه‌ی «بعدی» فقط به مرحله‌ی بعد می‌رود؛ ثبت نهایی در مرحله‌ی آخر
  const onSubmit = (e: React.FormEvent) => {
    if (steps.enabled && !steps.last) {
      e.preventDefault()
      return steps.next()
    }
    return form.handleSubmit(submitValid, steps.enabled ? steps.showErrors : undefined)(e)
  }

  const remove = useMutation({
    mutationFn: async () => {
      await pending.current
      const id = submission.current
      if (id) await target.remove(id)
    },
    onSuccess: () => {
      setLastSaved(serialized)
      target.invalidate()
      toast.success("پیش‌نویس حذف شد.")
      navigate(target.back.to)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const availability = context.availability
  const blocked = !editing && !!availability && availability.code !== "open"
  const draftStatus = {
    idle: undefined,
    saving: "در حال ذخیره‌ی پیش‌نویس…",
    saved: save.at ? `پیش‌نویس ذخیره شد · ${formatDateTime(save.at)}` : undefined,
    invalid: "پیش‌نویس ذخیره نشد؛ فیلدهای دارای ایراد را اصلاح کنید.",
    error: `پیش‌نویس ذخیره نشد: ${save.message}`,
  }[save.kind]
  const status = editing
    ? `ویرایش ثبت${editing.number ? ` شماره‌ی ${toFaDigits(editing.number)}` : ""}${editing.editable_until ? ` · تا ${formatDateTime(editing.editable_until)}` : ""}`
    : autosave
      ? draftStatus
      : "این فرم پیش‌نویس ندارد؛ آن را یک‌جا ثبت کنید."
  const header = <PageHeader title={context.title} description={context.description || undefined} breadcrumbs={[target.back]} meta={<span aria-live="polite">{status}</span>} />

  if (done)
    return (
      <>
        {header}
        <Confirmation
          title={context.title}
          template={definition.confirmation}
          submission={done}
          name={user?.full_name || user?.username || ""}
          back={target.back}
          againUrl={target.againUrl}
          editUrl={target.editUrl}
        />
      </>
    )

  return (
    <>
      {header}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {blocked && (
          <Alert variant="destructive">
            <CircleSlash />
            <AlertDescription>{availability?.message}</AlertDescription>
          </Alert>
        )}
        {!blocked && availability && availability.remaining !== null && !editing && (
          <p className="text-2xs text-muted-foreground">ظرفیت باقی‌مانده: {formatNumber(availability.remaining)}</p>
        )}
        {before}
        {definition.intro && <RichTextView html={definition.intro} className="rounded-lg border bg-card p-3" />}
        <ErrorSummary errors={form.formState.errors} labels={fieldLabels(definition)} submitCount={form.formState.submitCount} />
        {steps.enabled && <StepHeader steps={steps} />}
        <FormRenderer
          definition={definition}
          title={context.title}
          control={form.control}
          rules={rules}
          only={steps.enabled ? steps.section?.id : undefined}
          footer={
            <>
              {steps.enabled && !steps.first && (
                <Button type="button" variant="outline" onClick={steps.prev}>
                  <ChevronRight /> مرحله‌ی قبل
                </Button>
              )}
              {steps.enabled && !steps.last ? (
                <Button type="submit">
                  مرحله‌ی بعد <ChevronLeft />
                </Button>
              ) : (
                <Button type="submit" disabled={submitting || blocked}>
                  {submitting ? <Spinner /> : <Send />}
                  {submitting ? "در حال ثبت…" : editing ? "ذخیره‌ی تغییرات" : definition.submit_label || "ثبت نهایی"}
                </Button>
              )}
              {submissionId !== null && !editing && (
                <Button type="button" variant="ghost" className="text-destructive" disabled={submitting} onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> حذف پیش‌نویس
                </Button>
              )}
              {!editing && (
                <span className="text-2xs text-muted-foreground">
                  {context.edit_hours ? `پس از ثبت، تا ${formatNumber(context.edit_hours)} ساعت می‌توانید آن را ویرایش کنید.` : "پس از ثبت نهایی، فرم دیگر تغییر نمی‌کند."}
                </span>
              )}
            </>
          }
        />
      </form>
      {review && (
        <ReviewDialog
          title={context.title}
          definition={definition}
          values={review}
          confirmLabel={editing ? "تأیید و ذخیره" : "تأیید و ثبت"}
          submitting={submitting}
          onConfirm={() => confirmSubmit(review)}
          onCancel={() => setReview(null)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="حذف پیش‌نویس"
        description={`پیش‌نویس «${context.title}» و فایل‌های پیوست آن حذف می‌شود.`}
        confirmLabel="حذف پیش‌نویس"
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
      <UnsavedChangesGuard when={changed && !submitting && !remove.isPending && !done} />
    </>
  )
}
