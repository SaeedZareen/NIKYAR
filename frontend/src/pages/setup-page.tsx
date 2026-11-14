import * as React from "react"
import { Navigate, useNavigate } from "react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Building2, Copy, FlaskConical, Rocket } from "lucide-react"
import { SESSION_KEY, useSession } from "@/app/auth"
import { useBranding } from "@/app/branding"
import { SETUP_KEY, useSetupStatus } from "@/app/setup"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { DigitsInput } from "@/components/form/inputs"
import { useAppForm } from "@/components/form/use-app-form"
import { FilePicker } from "@/components/files/file-picker"
import { BrandMark } from "@/components/layout/brand-mark"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, errorMessage, unwrap } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"
import { schemas } from "@/lib/validators"
import { MONTHS } from "@/app/work-calendar"
import { formToWeek, WEEK_LABELS, weekSchema, weekToForm } from "@/pages/admin/settings/work-week"
import { WorkWeekTable } from "@/pages/admin/settings/work-week-table"

const STEPS = ["شروع", "سازمان", "راهبر سامانه", "روزها و ساعت کاری", "لایسنس"]
const DEFAULT_WEEK = [0, 1, 2, 3, 4].map((day) => ({ day, start: "08:00", end: "16:00" }))

const startSchema = z.object({ code: schemas.required("کد راه‌اندازی"), mode: z.enum(["org", "demo"]) })
const orgSchema = z.object({ org_name: schemas.required("نام کامل سازمان"), short_name: z.string(), fiscal_start_month: z.string() })
const adminSchema = z
  .object({
    first_name: schemas.required("نام"),
    last_name: schemas.required("نام خانوادگی"),
    username: schemas.required("نام کاربری"),
    password: schemas.required("گذرواژه"),
    password_confirm: schemas.required("تکرار گذرواژه"),
    mobile: z.union([z.literal(""), schemas.mobile]),
    email: z.union([z.literal(""), schemas.email]),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"], message: "تکرار گذرواژه با گذرواژه یکی نیست." })

const START_LABELS = { code: "کد راه‌اندازی", mode: "نوع راه‌اندازی" }
const ORG_LABELS = { org_name: "نام کامل سازمان", short_name: "نام کوتاه", fiscal_start_month: "ماه آغاز سال مالی", logo: "لوگو" }
const ADMIN_LABELS = { first_name: "نام", last_name: "نام خانوادگی", username: "نام کاربری", password: "گذرواژه", password_confirm: "تکرار گذرواژه", mobile: "موبایل", email: "ایمیل" }

/** «راه‌اندازی نخستین»: پیش از نخستین کاربر، به‌جای صفحه‌ی ورود؛ با کد پنجره‌ی سرور، راه‌اندازی سازمان یا نسخه‌ی نمایشی. */
export default function SetupPage() {
  const session = useSession()
  const status = useSetupStatus()
  const { version } = useBranding()
  React.useEffect(() => {
    document.title = "راه‌اندازی نخستین · نیک‌یار"
  }, [])
  if (session.data) return <Navigate to="/" replace />
  if (status.data && !status.data.needed) return <Navigate to="/login" replace />
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[1fr_minmax(0,40rem)]">
      <section aria-label="معرفی سامانه" className="hidden flex-col justify-between bg-header p-10 text-header-foreground lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10 rounded-lg text-lg" />
          <div>
            <p className="text-base font-bold">نیک‌یار</p>
            <p className="text-2xs text-header-muted">سامانه‌ی یکپارچه‌ی مدیریت فرایند و منابع سازمانی</p>
          </div>
        </div>
        <ul className="flex max-w-md flex-col gap-4 text-sm">
          <li>چند دقیقه تا آماده شدن سامانه برای سازمان شما.</li>
          <li>همه‌ی این مقدارها بعداً در «تنظیمات» تغییر می‌کنند.</li>
          <li>اطلاعات فقط روی همین سرور سازمان نگه داشته می‌شود.</li>
        </ul>
        <p className="text-2xs text-header-muted">{version && `نسخه‌ی ${toFaDigits(version.split(".").slice(0, 2).join("٫"))}`}</p>
      </section>
      <div className="flex items-start justify-center p-6 lg:items-center">
        {status.isPending ? <Spinner /> : status.error ? <Alert variant="destructive"><AlertDescription>{errorMessage(status.error)}</AlertDescription></Alert> : <Wizard installId={status.data.install_id} />}
      </div>
    </main>
  )
}

function Wizard({ installId }: { installId: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = React.useState(0)
  const [logo, setLogo] = React.useState<File | null>(null)
  const [license, setLicense] = React.useState<File | null>(null)
  const [licenseError, setLicenseError] = React.useState("")
  const start = useAppForm(startSchema, { code: "", mode: "org" as "org" | "demo" })
  const org = useAppForm(orgSchema, { org_name: "", short_name: "", fiscal_start_month: "1" })
  const admin = useAppForm(adminSchema, { first_name: "", last_name: "", username: "admin", password: "", password_confirm: "", mobile: "", email: "" })
  const week = useAppForm(weekSchema, weekToForm(DEFAULT_WEEK))
  const mode = start.watch("mode")

  const finish = useMutation({
    mutationFn: () => {
      const body = new FormData()
      const add = (key: string, value: string | Blob | null | undefined) => value !== undefined && value !== null && value !== "" && body.append(key, value)
      add("code", start.getValues("code"))
      add("mode", mode)
      if (mode === "org") {
        for (const [k, v] of Object.entries(org.getValues())) add(k, v)
        const { password_confirm: _, ...person } = admin.getValues()
        for (const [k, v] of Object.entries(person)) add(k, v)
        add("work_days", JSON.stringify(formToWeek(week.getValues())))
        add("logo", logo)
        add("license", license)
      }
      return unwrap(api.POST("/api/setup/", { body: {} as never, bodySerializer: () => body }))
    },
    onSuccess: (me) => {
      qc.setQueryData(SETUP_KEY, (old: { install_id: string } | undefined) => ({ install_id: old?.install_id ?? "", needed: false }))
      if (mode === "demo") {
        toast.success("نسخه‌ی نمایشی آماده شد. با نام کاربری admin و گذرواژه‌ی nikyar123 وارد شوید.")
        navigate("/login", { replace: true })
        return
      }
      qc.setQueryData(SESSION_KEY, me ?? null)
      toast.success("راه‌اندازی تمام شد؛ به نیک‌یار خوش آمدید.")
      navigate("/", { replace: true })
    },
    onError: (e) => {
      // هر خطای سرور روی فیلد گام خودش؛ نخستین گامی که خطا دارد باز می‌شود
      const fields = e instanceof ApiError ? e.fields : {}
      const targets: [number, UseFormReturn<FieldValues>, string[]][] = [
        [0, start as never, ["code", "mode"]],
        [1, org as never, ["org_name", "short_name", "fiscal_start_month", "logo"]],
        [2, admin as never, ["first_name", "last_name", "username", "password", "mobile", "email"]],
        [3, week as never, ["work_days"]],
      ]
      let first = Object.keys(fields).length ? STEPS.length - 1 : step
      for (const [index, form, names] of targets)
        for (const name of names.filter((n) => fields[n])) {
          form.setError((name === "work_days" ? "days" : name === "logo" ? "root.server" : name) as Path<FieldValues>, { type: "server", message: fields[name] })
          first = Math.min(first, index)
        }
      setLicenseError(fields.license ?? "")
      if (!Object.keys(fields).length) start.setError("root.server", { type: "server", message: errorMessage(e) })
      setStep(Object.keys(fields).length ? first : 0)
    },
  })

  const forms = [start, org, admin, week] as const
  const next = async () => {
    const form = forms[step] as unknown as UseFormReturn<FieldValues> | undefined
    if (form && !(await form.trigger())) return
    if (step === 0 && mode === "demo") return finish.mutate()
    if (step === STEPS.length - 1) return finish.mutate()
    setStep(step + 1)
  }
  const last = step === STEPS.length - 1 || (step === 0 && mode === "demo")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void next()
      }}
      noValidate
      className="flex w-full max-w-xl flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <BrandMark className="mb-1 size-12 rounded-lg text-xl lg:hidden" />
        <p className="text-2xs text-muted-foreground">
          گام {toFaDigits(step + 1)} از {toFaDigits(mode === "demo" ? 1 : STEPS.length)} · {STEPS[step]}
        </p>
        <Progress value={mode === "demo" ? 100 : ((step + 1) / STEPS.length) * 100} aria-label="پیشرفت راه‌اندازی" />
        <h1 className="mt-2 text-lg font-bold">{step === 0 ? "راه‌اندازی نخستین نیک‌یار" : STEPS[step]}</h1>
      </div>

      {step === 0 && <StartStep form={start} />}
      {step === 1 && <OrgStep form={org} logo={logo} setLogo={setLogo} />}
      {step === 2 && <AdminStep form={admin} />}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          <p className="text-2xs text-muted-foreground">روزها و ساعت‌هایی که سازمان کار می‌کند؛ مهلت کارها و گزارش‌ها بر همین پایه حساب می‌شوند. تعطیلات رسمی خودکار ثبت شده‌اند.</p>
          <ErrorSummary errors={week.formState.errors} labels={WEEK_LABELS} submitCount={week.formState.submitCount} />
          <WorkWeekTable form={week} />
        </div>
      )}
      {step === 4 && <LicenseStep installId={installId} license={license} setLicense={setLicense} error={licenseError} />}

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep(step - 1)} disabled={finish.isPending}>
            <ArrowRight /> بازگشت
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={finish.isPending}>
          {finish.isPending ? <Spinner /> : last ? <Rocket /> : null}
          {last ? (mode === "demo" ? "ساخت نسخه‌ی نمایشی" : "پایان راه‌اندازی") : "ادامه"}
          {!last && <ArrowLeft />}
        </Button>
      </div>
    </form>
  )
}

function StartStep({ form }: { form: UseFormReturn<z.input<typeof startSchema>> }) {
  return (
    <FieldGroup className="gap-4">
      <ErrorSummary errors={form.formState.errors} labels={START_LABELS} submitCount={form.formState.submitCount} />
      <FormField
        control={form.control}
        name="code"
        label="کد راه‌اندازی"
        layout="stacked"
        required
        description="کد هشت‌حرفی که در پنجره‌ی سرور نیک‌یار (start.bat) زیر «First-run setup» نوشته شده است. فقط کسی که به خود سرور دسترسی دارد آن را می‌بیند."
        render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" autoFocus placeholder="ABCD-EFGH" className="font-mono uppercase" {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="mode"
        label="نوع راه‌اندازی"
        layout="stacked"
        render={({ field, id, aria }) => (
          <RadioGroup id={id} value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-2" {...aria}>
            {[
              { value: "org", icon: Building2, title: "راه‌اندازی سازمان", text: "سامانه‌ی خالی برای کار واقعی: مشخصات سازمان، راهبر سامانه، روزهای کاری و لایسنس." },
              { value: "demo", icon: FlaskConical, title: "نسخه‌ی نمایشی", text: "با سازمان، کاربران و واحدهای نمونه برای آشنایی و آزمایش؛ برای کار واقعی نیست." },
            ].map((o) => (
              <label key={o.value} className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                <RadioGroupItem value={o.value} aria-label={o.title} className="mt-0.5" />
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <o.icon className="size-4 text-primary" aria-hidden /> {o.title}
                  </span>
                  <span className="text-2xs text-muted-foreground">{o.text}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
      />
      {form.formState.errors.root?.server && (
        <Alert variant="destructive">
          <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  )
}

function OrgStep({ form, logo, setLogo }: { form: UseFormReturn<z.input<typeof orgSchema>>; logo: File | null; setLogo: (f: File | null) => void }) {
  return (
    <FieldGroup className="gap-3">
      <ErrorSummary errors={form.formState.errors} labels={ORG_LABELS} submitCount={form.formState.submitCount} />
      <FormField control={form.control} name="org_name" label="نام کامل سازمان" layout="stacked" required render={({ field, id, aria }) => <Input id={id} autoFocus {...field} {...aria} />} />
      <FormField
        control={form.control}
        name="short_name"
        label="نام کوتاه"
        layout="stacked"
        description="در نوار بالای سامانه و جاهای کم‌جا؛ مثل «شرکت نمونه»."
        render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="fiscal_start_month"
        label="ماه آغاز سال مالی"
        layout="stacked"
        render={({ field, id, aria }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} className="w-full" {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <div className="flex flex-col gap-1.5">
        <span id="setup-logo-label" className="text-xs font-medium">
          لوگو
        </span>
        <FilePicker id="setup-logo" value={logo} onChange={setLogo} accept=".png,.jpg,.jpeg,.webp" label="انتخاب تصویر لوگو" aria-labelledby="setup-logo-label" />
        <p className="text-2xs text-muted-foreground">اختیاری؛ در سربرگ چاپ‌ها و صفحه‌ی ورود.</p>
      </div>
      {form.formState.errors.root?.server && (
        <Alert variant="destructive">
          <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  )
}

function AdminStep({ form }: { form: UseFormReturn<z.input<typeof adminSchema>> }) {
  const text = (name: "first_name" | "last_name", label: string, autoFocus = false) => (
    <FormField control={form.control} name={name} label={label} layout="stacked" required render={({ field, id, aria }) => <Input id={id} autoFocus={autoFocus} {...field} {...aria} />} />
  )
  return (
    <FieldGroup className="gap-3">
      <p className="text-2xs text-muted-foreground">راهبر سامانه به همه‌ی بخش‌ها دسترسی دارد و کاربران دیگر را می‌سازد. پس از پایان، با همین حساب وارد می‌شوید.</p>
      <ErrorSummary errors={form.formState.errors} labels={ADMIN_LABELS} submitCount={form.formState.submitCount} />
      <div className="grid gap-3 sm:grid-cols-2">
        {text("first_name", "نام", true)}
        {text("last_name", "نام خانوادگی")}
      </div>
      <FormField control={form.control} name="username" label="نام کاربری" layout="stacked" required render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="username" {...field} {...aria} />} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="password"
          label="گذرواژه"
          layout="stacked"
          required
          description="دست‌کم هشت نویسه، نه فقط عدد و نه شبیه نام."
          render={({ field, id, aria }) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="password_confirm"
          label="تکرار گذرواژه"
          layout="stacked"
          required
          render={({ field, id, aria }) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" {...field} {...aria} />}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField control={form.control} name="mobile" label="موبایل" layout="stacked" render={({ field, id, aria }) => <DigitsInput id={id} kind="mobile" {...field} {...aria} />} />
        <FormField control={form.control} name="email" label="ایمیل" layout="stacked" render={({ field, id, aria }) => <Input id={id} dir="ltr" type="email" {...field} {...aria} />} />
      </div>
    </FieldGroup>
  )
}

function LicenseStep({ installId, license, setLicense, error }: { installId: string; license: File | null; setLicense: (f: File | null) => void; error: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs">
        بدون لایسنس، نیک‌یار <strong>۳۰ روز آزمایشی</strong> با همه‌ی ماژول‌ها کار می‌کند. برای لایسنس، شناسه‌ی نصب زیر را برای صادرکننده بفرستید؛ فایل لایسنس را همین‌جا یا بعداً در «ماژول‌ها و لایسنس» بارگذاری کنید.
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
        <span className="text-2xs text-muted-foreground">شناسه‌ی نصب</span>
        <code dir="ltr" className="font-mono text-xs font-semibold">
          {installId}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(installId)
            toast.success("شناسه‌ی نصب رونوشت شد.")
          }}
        >
          <Copy /> رونوشت
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="setup-license-label" className="text-xs font-medium">
          فایل لایسنس (اختیاری)
        </span>
        <FilePicker id="setup-license" value={license} onChange={setLicense} accept=".nikyar-license" label="انتخاب فایل لایسنس" aria-labelledby="setup-license-label" aria-invalid={!!error} />
        {error && (
          <p role="alert" className="text-2xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
