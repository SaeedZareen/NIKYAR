import * as React from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router"
import { z } from "zod"
import { ArrowRight, LogIn, RefreshCw } from "lucide-react"
import { Link } from "react-router"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useLogin, useLoginCode, useSession, type Challenge } from "@/app/auth"
import { useBranding } from "@/app/branding"
import { useSetupStatus } from "@/app/setup"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { BrandMark } from "@/components/layout/brand-mark"
import { useAppForm } from "@/components/form/use-app-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"
import { schemas } from "@/lib/validators"

const schema = z.object({ username: schemas.required("نام کاربری"), password: schemas.required("گذرواژه") })
const LABELS = { username: "نام کاربری", password: "گذرواژه" }

/** فقط نشانی‌های داخلی برای بازگشت پس از ورود پذیرفته می‌شوند. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
}

export default function LoginPage() {
  const session = useSession()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const login = useLogin()
  const { name: orgName, version, passwordReset } = useBranding()
  const form = useAppForm(schema, { username: "", password: "" }, { validateOn: "submit" })
  const [challenge, setChallenge] = React.useState<Challenge | null>(null)
  const next = safeNext(params.get("next"))
  const setup = useSetupStatus()
  React.useEffect(() => {
    document.title = "ورود · نیک‌یار"
  }, [])

  if (session.data) return <Navigate to={next} replace />
  if (setup.data?.needed) return <Navigate to="/setup" replace />

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await login.mutateAsync(values)
      if ("token" in result) setChallenge(result)
      else navigate(next, { replace: true })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[1fr_minmax(0,28rem)]">
      <section aria-label="معرفی سامانه" className="hidden flex-col justify-between bg-header p-10 text-header-foreground lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10 rounded-lg text-lg" />
          <div>
            <p className="text-base font-bold">نیک‌یار</p>
            <p className="text-2xs text-header-muted">سامانه‌ی یکپارچه‌ی مدیریت فرایند و منابع سازمانی</p>
          </div>
        </div>
        <ul className="flex max-w-md flex-col gap-4 text-sm">
          <li>فرایندهای اداری را بدون برنامه‌نویسی طراحی و اجرا کنید.</li>
          <li>هر کار بر اساس ساختار سازمانی به کارتابل فرد درست می‌رسد.</li>
          <li>ماژول‌ها را به‌تدریج اضافه کنید: پرونده‌ی پرسنلی امروز، حقوق و انبار فردا.</li>
        </ul>
        <p className="text-2xs text-header-muted">{version && `نسخه‌ی ${toFaDigits(version.split(".").slice(0, 2).join("٫"))}`}</p>
      </section>

      <div className="flex items-center justify-center p-6">
        {challenge ? (
          <CodeStep challenge={challenge} onBack={() => setChallenge(null)} onDone={() => navigate(next, { replace: true })} />
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
            <div>
              <BrandMark className="mb-3 size-12 rounded-lg text-xl lg:hidden" />
              {orgName && <p className="mb-1 text-sm font-semibold text-primary">{orgName}</p>}
              <h1 className="text-lg font-bold">ورود به سامانه</h1>
              <p className="mt-1 text-2xs text-muted-foreground">با نام کاربری و گذرواژه‌ی سازمانی وارد شوید.</p>
              {passwordReset && (
                <Link to="/forgot-password" className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline">
                  گذرواژه را فراموش کرده‌ام
                </Link>
              )}
            </div>
            {params.get("reason") === "idle" && (
              <Alert>
                <AlertDescription>به دلیل بی‌کاری از سامانه خارج شدید؛ دوباره وارد شوید.</AlertDescription>
              </Alert>
            )}
            {params.get("reason") === "reset" && (
              <Alert>
                <AlertDescription>گذرواژه‌ی تازه ثبت شد؛ با آن وارد شوید.</AlertDescription>
              </Alert>
            )}
            <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
            <FieldGroup className="gap-3">
              <FormField
                control={form.control}
                name="username"
                label="نام کاربری"
                layout="stacked"
                render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="username" autoFocus {...field} {...aria} />}
              />
              <FormField
                control={form.control}
                name="password"
                label="گذرواژه"
                layout="stacked"
                render={({ field, id, aria }) => <Input id={id} type="password" dir="ltr" autoComplete="current-password" {...field} {...aria} />}
              />
            </FieldGroup>
            <Button type="submit" size="lg" disabled={login.isPending}>
              {login.isPending ? <Spinner /> : <LogIn />}
              {login.isPending ? "در حال ورود…" : "ورود"}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9۰-۹]{6}$/, "کد شش‌رقمی پیامک را وارد کنید."),
})

/** رمز دوم: کد شش‌رقمی پیامکی، با فرستادن دوباره پس از یک دقیقه. */
function CodeStep({ challenge, onBack, onDone }: { challenge: Challenge; onBack: () => void; onDone: () => void }) {
  const verify = useLoginCode()
  const form = useAppForm(codeSchema, { code: "" })
  const [wait, setWait] = React.useState(60)
  React.useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  const resend = useMutation({
    mutationFn: () => unwrap(api.PUT("/api/auth/session/code/", { body: { token: challenge.token } })),
    onSuccess: () => {
      setWait(60)
      toast.success("کد تازه فرستاده شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await verify.mutateAsync({ token: challenge.token, code: v.code })
      onDone()
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold">رمز دوم</h1>
        <p className="mt-1 text-2xs text-muted-foreground">
          کد شش‌رقمی به موبایل <bdi dir="ltr">{challenge.mobile}</bdi> پیامک شد؛ تا ۵ دقیقه معتبر است.
        </p>
      </div>
      <ErrorSummary errors={form.formState.errors} labels={{ code: "کد پیامک" }} submitCount={form.formState.submitCount} />
      <FormField
        control={form.control}
        name="code"
        label="کد پیامک"
        layout="stacked"
        render={({ field, id, aria }) => (
          <Input id={id} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus className="text-center tracking-widest" {...field} {...aria} />
        )}
      />
      <Button type="submit" size="lg" disabled={verify.isPending}>
        {verify.isPending ? <Spinner /> : <LogIn />} تأیید و ورود
      </Button>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowRight /> بازگشت
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={wait > 0 || resend.isPending} onClick={() => resend.mutate()}>
          <RefreshCw /> {wait > 0 ? `فرستادن دوباره (${toFaDigits(wait)})` : "فرستادن دوباره"}
        </Button>
      </div>
    </form>
  )
}
