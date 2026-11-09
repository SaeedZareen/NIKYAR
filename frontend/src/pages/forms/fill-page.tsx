import * as React from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { useForm, useWatch } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ErrorSummary } from "@/components/form/error-summary"
import { applyServerErrors } from "@/components/form/server-errors"
import { UnsavedChangesGuard } from "@/components/form/unsaved-changes-guard"
import { fieldLabels, toFormValues, toPayload, type FormDefinition, type FormValues } from "@/components/form-renderer/definition"
import { FormRenderer } from "@/components/form-renderer/form-renderer"
import { applyRules } from "@/components/form-renderer/rules"
import { formResolver, validate, type JsonSchema } from "@/components/form-renderer/validate"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { useAuth } from "@/app/auth"
import { SUBMISSIONS_KEY } from "@/app/forms"
import { PageError, PageFallback } from "@/app/route-states"

type Context = Schemas["FillContext"]
const AUTOSAVE_DELAY = 1500

/**
 * پر کردن فرم: فرم تازه (/forms/:formId/fill) یا ادامه‌ی پیش‌نویس (?draft=شناسه).
 * پیش‌نویس با هر تغییر خودکار ذخیره می‌شود؛ پس از نخستین ذخیره، شناسه‌اش در نشانی می‌آید تا بازخوانی صفحه آن را از دست ندهد.
 */
export default function FormFillPage() {
  const { formId } = useParams()
  const [search] = useSearchParams()
  const draft = search.get("draft")

  const query = useQuery({
    queryKey: ["forms", "fill", formId, draft],
    queryFn: async () => {
      if (draft) {
        const sub = await unwrap(api.GET("/api/forms/submissions/{id}/", { params: { path: { id: Number(draft) } } }))
        return { context: sub.context, data: sub.data, submissionId: sub.id, updatedAt: sub.updated_at }
      }
      const context = await unwrap(api.GET("/api/forms/{id}/fill/", { params: { path: { id: formId ?? "" } } }))
      return { context, data: undefined, submissionId: null, updatedAt: null }
    },
    staleTime: Infinity,
    gcTime: 0,
  })

  if (query.isPending) return <PageFallback />
  if (query.error) return <PageError error={query.error} onRetry={() => query.refetch()} />
  const { context, data, submissionId, updatedAt } = query.data
  return (
    <FillForm
      key={draft ?? "new"}
      context={context}
      initialData={data}
      initialSubmission={submissionId}
      initialSavedAt={updatedAt}
      onCreated={(id) => {
        // فقط نشانی مرورگر (برای بازخوانی صفحه)؛ نه پیمایش مسیریاب، تا صفحه از نو ساخته نشود و هشدار خروج هم باز نشود.
        window.history.replaceState(window.history.state, "", `?draft=${id}`)
      }}
    />
  )
}

type SaveState = { kind: "idle" | "saving" | "saved" | "invalid" | "error"; at?: string | null; message?: string }

type FillProps = {
  context: Context
  initialData?: Record<string, unknown>
  initialSubmission: number | null
  initialSavedAt: string | null
  onCreated: (id: number) => void
}

function FillForm({ context, initialData, initialSubmission, initialSavedAt, onCreated }: FillProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
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
  const defaults = React.useMemo(() => toFormValues(definition, initialData, me), [definition, initialData, me])
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

  // قاعده‌ها زنده: فیلدهای پنهان در داده‌ی ارسالی نمی‌آیند (مقدارشان در فرم می‌ماند تا اگر دوباره دیده شدند، از دست نرود).
  const { values: payload, state: rules } = React.useMemo(() => applyRules(definition, toPayload(definition, values as FormValues)), [definition, values])
  const serialized = JSON.stringify(payload)
  const changed = serialized !== lastSaved

  /** ذخیره‌ی پیش‌نویس یا ثبت نهایی؛ درخواست‌ها پشت سر هم اجرا می‌شوند تا ترتیب ذخیره‌ها به هم نریزد. */
  const send = React.useCallback(
    (body: Record<string, unknown>, submit: boolean) => {
      const run = pending.current.then(async () => {
        const id = submission.current
        const result = id
          ? await unwrap(api.PATCH("/api/forms/submissions/{id}/", { params: { path: { id } }, body: { data: body, submit } }))
          : await unwrap(api.POST("/api/forms/submissions/", { body: { form: context.form, data: body, submit } }))
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
    [context.form, onCreated]
  )

  // ذخیره‌ی خودکار پیش‌نویس، کمی پس از آخرین تغییر؛ فقط اگر داده با طرح پیش‌نویس درست باشد.
  React.useEffect(() => {
    if (!changed || submitting) return
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
  }, [changed, serialized, submitting, draftSchema, send])

  const submitValid = async (formValues: FormValues) => {
    setSubmitting(true)
    try {
      await send(applyRules(definition, toPayload(definition, formValues)).values, true)
      qc.invalidateQueries({ queryKey: SUBMISSIONS_KEY })
      toast.success(`فرم «${context.title}» ثبت شد.`)
      navigate("/forms")
    } catch (e) {
      applyServerErrors(form, e)
      setSubmitting(false)
    }
  }
  const onSubmit = (e: React.FormEvent) => form.handleSubmit(submitValid)(e)

  const remove = useMutation({
    mutationFn: async () => {
      await pending.current
      const id = submission.current
      if (id) await unwrap(api.DELETE("/api/forms/submissions/{id}/", { params: { path: { id } } }))
    },
    onSuccess: () => {
      setLastSaved(serialized)
      qc.invalidateQueries({ queryKey: SUBMISSIONS_KEY })
      toast.success("پیش‌نویس حذف شد.")
      navigate("/forms")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const status = {
    idle: undefined,
    saving: "در حال ذخیره‌ی پیش‌نویس…",
    saved: save.at ? `پیش‌نویس ذخیره شد · ${formatDateTime(save.at)}` : undefined,
    invalid: "پیش‌نویس ذخیره نشد؛ فیلدهای دارای ایراد را اصلاح کنید.",
    error: `پیش‌نویس ذخیره نشد: ${save.message}`,
  }[save.kind]

  return (
    <>
      <PageHeader
        title={context.title}
        description={context.description || undefined}
        breadcrumbs={[{ label: "فرم‌ها", to: "/forms" }]}
        meta={<span aria-live="polite">{status}</span>}
      />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={form.formState.errors} labels={fieldLabels(definition)} submitCount={form.formState.submitCount} />
        <FormRenderer
          definition={definition}
          title={context.title}
          control={form.control}
          rules={rules}
          footer={
            <>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner /> : <Send />}
                {submitting ? "در حال ثبت…" : "ثبت نهایی"}
              </Button>
              {submissionId !== null && (
                <Button type="button" variant="ghost" className="text-destructive" disabled={submitting} onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> حذف پیش‌نویس
                </Button>
              )}
              <span className="text-2xs text-muted-foreground">پس از ثبت نهایی، فرم دیگر تغییر نمی‌کند.</span>
            </>
          }
        />
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="حذف پیش‌نویس"
        description={`پیش‌نویس «${context.title}» و فایل‌های پیوست آن حذف می‌شود.`}
        confirmLabel="حذف پیش‌نویس"
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
      <UnsavedChangesGuard when={changed && !submitting && !remove.isPending} />
    </>
  )
}
