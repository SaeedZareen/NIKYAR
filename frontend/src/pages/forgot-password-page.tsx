import * as React from "react"
import { Link, Navigate, useNavigate } from "react-router"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight, KeyRound, Send } from "lucide-react"
import { z } from "zod"
import { useAuth } from "@/app/auth"
import { useBranding } from "@/app/branding"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { BrandMark } from "@/components/layout/brand-mark"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { schemas } from "@/lib/validators"

const askSchema = z.object({ username: schemas.required("نام کاربری") })
const resetSchema = z
  .object({
    code: z.string().trim().regex(/^[0-9۰-۹]{6}$/, "کد شش‌رقمی پیامک را وارد کنید."),
    new_password: schemas.required("گذرواژه‌ی جدید"),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "تکرار گذرواژه با گذرواژه‌ی جدید یکی نیست." })
const RESET_LABELS = { code: "کد پیامک", new_password: "گذرواژه‌ی جدید", confirm: "تکرار گذرواژه‌ی جدید" }

/** «فراموشی گذرواژه»: نام کاربری ← کد پیامکی به موبایل ثبت‌شده ← گذرواژه‌ی تازه (بی ورود). */
export default function ForgotPasswordPage() {
  const { user } = useAuth()
  const { name: orgName } = useBranding()
  const navigate = useNavigate()
  const [challenge, setChallenge] = React.useState<Schemas["Challenge"] | null>(null)
  React.useEffect(() => {
    document.title = "فراموشی گذرواژه · نیک‌یار"
  }, [])
  if (user) return <Navigate to="/" replace />

  return (
    <main className="flex min-h-svh items-start justify-center bg-background p-4 sm:items-center">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <BrandMark className="mb-3 size-12 rounded-lg text-xl" />
          {orgName && <p className="mb-1 text-sm font-semibold text-primary">{orgName}</p>}
          <h1 className="text-lg font-bold">فراموشی گذرواژه</h1>
        </div>
        {challenge ? <ResetStep challenge={challenge} onDone={() => navigate("/login?reason=reset", { replace: true })} /> : <AskStep onSent={setChallenge} />}
        <Link to="/login" className="inline-flex items-center gap-1 self-center text-xs text-primary underline-offset-2 hover:underline">
          <ArrowRight className="size-3.5" /> بازگشت به ورود
        </Link>
      </div>
    </main>
  )
}

function AskStep({ onSent }: { onSent: (c: Schemas["Challenge"]) => void }) {
  const form = useAppForm(askSchema, { username: "" })
  const ask = useMutation({ mutationFn: (body: Schemas["ResetRequestRequest"]) => unwrap(api.POST("/api/auth/password-reset/", { body })) })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      onSent(await ask.mutateAsync(v))
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-2xs text-muted-foreground">نام کاربری خود را بنویسید؛ کد شش‌رقمی به موبایلی که در حسابتان ثبت شده پیامک می‌شود.</p>
      <ErrorSummary errors={form.formState.errors} labels={{ username: "نام کاربری" }} submitCount={form.formState.submitCount} />
      <FormField
        control={form.control}
        name="username"
        label="نام کاربری"
        layout="stacked"
        render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="username" autoFocus {...field} {...aria} />}
      />
      <Button type="submit" size="lg" disabled={ask.isPending}>
        {ask.isPending ? <Spinner /> : <Send />} فرستادن کد
      </Button>
    </form>
  )
}

function ResetStep({ challenge, onDone }: { challenge: Schemas["Challenge"]; onDone: () => void }) {
  const form = useAppForm(resetSchema, { code: "", new_password: "", confirm: "" })
  const reset = useMutation({ mutationFn: (body: Schemas["ResetConfirmRequest"]) => unwrap(api.PUT("/api/auth/password-reset/", { body })) })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await reset.mutateAsync({ token: challenge.token, code: v.code, new_password: v.new_password })
      onDone()
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Alert role="status">
        <AlertDescription>
          {challenge.mobile ? (
            <>
              اگر نام کاربری درست باشد، کد به موبایل <bdi dir="ltr">{challenge.mobile}</bdi> پیامک شد؛ تا ۵ دقیقه معتبر است.
            </>
          ) : (
            "اگر نام کاربری درست باشد و موبایل در حسابتان ثبت شده باشد، کد پیامک شد؛ تا ۵ دقیقه معتبر است. اگر پیامکی نرسید، به راهبر سامانه خبر دهید."
          )}
        </AlertDescription>
      </Alert>
      <ErrorSummary errors={form.formState.errors} labels={RESET_LABELS} submitCount={form.formState.submitCount} />
      <FieldGroup className="gap-3">
        <FormField
          control={form.control}
          name="code"
          label={RESET_LABELS.code}
          layout="stacked"
          render={({ field, id, aria }) => (
            <Input id={id} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus className="text-center tracking-widest" {...field} {...aria} />
          )}
        />
        {(["new_password", "confirm"] as const).map((name) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            label={RESET_LABELS[name]}
            layout="stacked"
            render={({ field, id, aria }) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" {...field} {...aria} />}
          />
        ))}
      </FieldGroup>
      <Button type="submit" size="lg" disabled={reset.isPending}>
        {reset.isPending ? <Spinner /> : <KeyRound />} ثبت گذرواژه‌ی تازه
      </Button>
    </form>
  )
}
