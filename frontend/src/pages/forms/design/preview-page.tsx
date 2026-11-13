import * as React from "react"
import { useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { useForm, useWatch } from "react-hook-form"
import { CircleCheck, FlaskConical, RotateCcw } from "lucide-react"
import { useAuth } from "@/app/auth"
import { PageError, PageFallback } from "@/app/route-states"
import { ErrorSummary } from "@/components/form/error-summary"
import { fieldLabels, toFormValues, toPayload, type FormDefinition, type FormValues } from "@/components/form-renderer/definition"
import { FormRenderer } from "@/components/form-renderer/form-renderer"
import { StepHeader } from "@/components/form-renderer/form-steps"
import { useFormSteps } from "@/components/form-renderer/use-form-steps"
import { applyRules } from "@/components/form-renderer/rules"
import { formResolver, type JsonSchema } from "@/components/form-renderer/validate"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RichTextView } from "@/components/rich-text"
import { Button } from "@/components/ui/button"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { confirmationHtml } from "../confirmation-text"

/**
 * پیش‌نمایش یک نسخه‌ی فرم در قاب طراح (رایانه یا موبایل): همان نمایشگر پر کردن، قاعده‌ها و اعتبارسنجی زنده،
 * و «آزمایش ثبت» که فقط می‌سنجد و چیزی ذخیره نمی‌کند.
 */
export default function PreviewPage() {
  const { versionId = "" } = useParams()
  const query = useQuery({
    queryKey: ["forms", "preview", versionId],
    queryFn: () => unwrap(api.GET("/api/forms/versions/{id}/", { params: { path: { id: Number(versionId) } } })),
    gcTime: 0,
  })
  if (query.isPending) return <PageFallback />
  if (query.error) return <PageError error={query.error} onRetry={() => query.refetch()} />
  return (
    <main className="flex min-h-svh flex-col gap-4 bg-background p-4">
      {query.data.schema ? (
        <Preview version={query.data} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>تعریف فرم ایراد دارد؛ ایرادها را در طراح برطرف کنید تا پیش‌نمایش ممکن شود.</AlertDescription>
        </Alert>
      )}
    </main>
  )
}

function Preview({ version }: { version: Schemas["FormVersionDetail"] }) {
  const definition = version.definition as FormDefinition
  const schema = version.schema as JsonSchema
  const { user } = useAuth()
  const title = version.form_title ?? ""
  const defaults = React.useMemo(
    () =>
      toFormValues(
        definition,
        undefined,
        user ? { id: user.id, unitId: user.assignment?.unit_id, profile: user.profile } : undefined
      ),
    [definition, user]
  )
  const form = useForm<FormValues>({ resolver: formResolver(definition, schema), defaultValues: defaults, mode: "onTouched", shouldFocusError: false })
  const values = useWatch({ control: form.control })
  const { state: rules } = React.useMemo(() => applyRules(definition, toPayload(definition, values as FormValues)), [definition, values])
  const steps = useFormSteps(definition, rules, form, title)
  const [passed, setPassed] = React.useState(false)
  const [sampleDate] = React.useState(() => formatDateTime(new Date().toISOString()))
  const onSubmit = (e: React.FormEvent) => {
    setPassed(false)
    if (steps.enabled && !steps.last) {
      e.preventDefault()
      return steps.next()
    }
    return form.handleSubmit(() => setPassed(true), steps.enabled ? steps.showErrors : undefined)(e)
  }
  return (
    <>
      <h1 className="text-sm font-semibold">{title}</h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={form.formState.errors} labels={fieldLabels(definition)} submitCount={form.formState.submitCount} />
        {passed && (
          <Alert>
            <CircleCheck />
            <AlertDescription className="flex flex-col gap-2">
              <span>همه‌ی فیلدها درست‌اند؛ در پیش‌نمایش چیزی ذخیره نمی‌شود. پیام پس از ثبت (با مقدارهای نمونه):</span>
              <RichTextView
                html={confirmationHtml(definition.confirmation, { number: "۱۴۰۵-۰۰۱", name: user?.full_name || "ثبت‌کننده", date: sampleDate, form: title })}
                className="text-foreground"
              />
            </AlertDescription>
          </Alert>
        )}
        {definition.intro && <RichTextView html={definition.intro} className="rounded-lg border bg-card p-3" />}
        {steps.enabled && <StepHeader steps={steps} />}
        <FormRenderer
          definition={definition}
          title={title}
          control={form.control}
          rules={rules}
          only={steps.enabled ? steps.section?.id : undefined}
          footer={
            <>
              {steps.enabled && !steps.first && (
                <Button type="button" variant="outline" onClick={steps.prev}>
                  مرحله‌ی قبل
                </Button>
              )}
              <Button type="submit" aria-label={steps.enabled && !steps.last ? undefined : "آزمایش ثبت"}>
                {steps.enabled && !steps.last ? "مرحله‌ی بعد" : <><FlaskConical /> {definition.submit_label || "ثبت نهایی"} (آزمایشی)</>}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  form.reset(defaults)
                  setPassed(false)
                }}
              >
                <RotateCcw /> پاک کردن
              </Button>
              <span className="text-2xs text-muted-foreground">پیش‌نمایش؛ چیزی ذخیره نمی‌شود.</span>
            </>
          }
        />
      </form>
    </>
  )
}
