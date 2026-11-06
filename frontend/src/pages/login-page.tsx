import * as React from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router"
import { z } from "zod"
import { LogIn } from "lucide-react"
import { useLogin, useSession } from "@/app/auth"
import { useBranding } from "@/app/branding"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { BrandMark } from "@/components/layout/brand-mark"
import { useAppForm } from "@/components/form/use-app-form"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
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
  const { name: orgName } = useBranding()
  const form = useAppForm(schema, { username: "", password: "" })
  const next = safeNext(params.get("next"))
  React.useEffect(() => {
    document.title = "ورود · نیک‌یار"
  }, [])

  if (session.data) return <Navigate to={next} replace />

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values)
      navigate(next, { replace: true })
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
            <p className="text-xs text-header-muted">سامانه‌ی یکپارچه‌ی مدیریت فرایند و منابع سازمانی</p>
          </div>
        </div>
        <ul className="flex max-w-md flex-col gap-4 text-sm">
          <li>فرایندهای اداری را بدون برنامه‌نویسی طراحی و اجرا کنید.</li>
          <li>هر کار بر اساس ساختار سازمانی به کارتابل فرد درست می‌رسد.</li>
          <li>ماژول‌ها را به‌تدریج اضافه کنید: پرونده‌ی پرسنلی امروز، حقوق و انبار فردا.</li>
        </ul>
        <p className="text-xs text-header-muted">نسخه‌ی ۰٫۲</p>
      </section>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
          <div>
            <BrandMark className="mb-3 size-12 rounded-lg text-xl lg:hidden" />
            {orgName && <p className="mb-1 text-sm font-semibold text-primary">{orgName}</p>}
            <h1 className="text-lg font-bold">ورود به سامانه</h1>
            <p className="mt-1 text-xs text-muted-foreground">با نام کاربری و گذرواژه‌ی سازمانی وارد شوید.</p>
          </div>
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
      </div>
    </main>
  )
}
