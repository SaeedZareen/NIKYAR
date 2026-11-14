import * as React from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, MessageSquare, PlugZap } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { useAuth } from "@/app/auth"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { FormField } from "@/components/form/form-field"
import { DigitsInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, onlyDigits, toFaDigits } from "@/lib/format"
import { schemas } from "@/lib/validators"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"

type Messaging = Schemas["MessagingSettings"]
type Delivery = Schemas["Delivery"]
const KEY = ["settings", "messaging"]
const DELIVERIES = ["deliveries"]
const NONE = "none"

const schema = z.object({
  sms_provider: z.string(),
  sms_username: z.string().trim(),
  sms_domain: z.string().trim(),
  sms_api_key: z.string(),
  sms_sender: z.string().trim(),
  email_enabled: z.boolean(),
  smtp_host: z.string().trim(),
  smtp_port: z.string().refine((v) => Number(v) >= 1 && Number(v) <= 65535, "درگاه باید بین ۱ تا ۶۵۵۳۵ باشد."),
  smtp_security: z.enum(["starttls", "ssl", "none"]),
  smtp_username: z.string().trim(),
  smtp_password: z.string(),
  from_email: z.union([z.literal(""), schemas.email]),
  site_url: z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "نشانی کامل وارد کنید، مثل http://192.168.1.20:8000" })]),
})
const LABELS = {
  sms_provider: "درگاه پیامک",
  sms_username: "نام کاربری درگاه",
  sms_domain: "دامنه‌ی حساب",
  sms_api_key: "کلید درگاه پیامک",
  sms_sender: "شماره‌ی فرستنده",
  email_enabled: "ارسال ایمیل",
  smtp_host: "سرور SMTP",
  smtp_port: "درگاه SMTP",
  smtp_security: "امنیت اتصال",
  smtp_username: "نام کاربری SMTP",
  smtp_password: "گذرواژه‌ی SMTP",
  from_email: "نشانی فرستنده",
  site_url: "نشانی سامانه",
}
const toForm = (m: Messaging) => ({ ...m, sms_provider: m.sms_provider || NONE, smtp_port: String(m.smtp_port) })

/** «تنظیمات › پیامک و ایمیل»: درگاه و سرور، ارسال آزمایشی، گزارش ارسال‌ها. */
export function MessagingSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/messaging/")) })
  return (
    <div className="flex flex-col gap-4">
      <SettingsLoader section={section} query={query}>
        {(data) => <MessagingForm section={section} data={data} />}
      </SettingsLoader>
      <TestSection />
      <DeliveriesSection />
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="col-span-full border-b pb-1 text-xs font-semibold text-muted-foreground">{children}</h3>
}

function MessagingForm({ section, data }: { section: SectionInfo; data: Messaging }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["MessagingSettingsRequest"]) => unwrap(api.PUT("/api/settings/messaging/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toForm(saved))
      toast.success("تنظیمات پیامک و ایمیل ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ ...v, sms_provider: (v.sms_provider === NONE ? "" : v.sms_provider) as Messaging["sms_provider"], smtp_port: Number(v.smtp_port) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const [provider, email] = form.watch(["sms_provider", "email_enabled"])
  const sms = provider !== NONE
  const gateways = useGateways()
  const gateway = gateways.data?.find((g) => g.code === provider)
  const needs = (c: Schemas["Gateway"]["credentials"][number]) => !!gateway?.credentials.includes(c)
  // درگاه‌های نام‌کاربری‌دار گذرواژه‌ی حساب را در همان فیلد رمز می‌گیرند
  const keyLabel = needs("password") ? "گذرواژه‌ی حساب درگاه" : LABELS.sms_api_key
  // رمزها: مقدار ذخیره‌شده با ماسک برمی‌گردد و همان ماسک یعنی «بدون تغییر».
  const secret = { type: "password", dir: "ltr" as const, autoComplete: "new-password" }

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <Heading>پیامک</Heading>
      <FormField
        control={form.control}
        name="sms_provider"
        label={LABELS.sms_provider}
        description="حساب کاربری درگاه را خود سازمان می‌سازد و هزینه‌ی پیامک را مستقیم به درگاه می‌پردازد."
        render={({ field, id, aria }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} className="w-full" {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>بدون پیامک</SelectItem>
              {(gateways.data ?? []).map((g) => (
                <SelectItem key={g.code} value={g.code}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {needs("username") && (
        <FormField
          control={form.control}
          name="sms_username"
          label={LABELS.sms_username}
          required
          description="نام کاربری ورود به پنل درگاه."
          render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" {...field} {...aria} />}
        />
      )}
      {needs("domain") && (
        <FormField
          control={form.control}
          name="sms_domain"
          label={LABELS.sms_domain}
          required
          description="دامنه‌ای که مگفا همراه نام کاربری داده است (مثلاً magfa)."
          render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" {...field} {...aria} />}
        />
      )}
      <FormField
        control={form.control}
        name="sms_api_key"
        label={keyLabel}
        required={sms}
        description={
          needs("password")
            ? "گذرواژه‌ی ورود به پنل درگاه (یا گذرواژه‌ی وب‌سرویس، اگر درگاه جدا داده است). گذرواژه‌ی ذخیره‌شده نمایش داده نمی‌شود."
            : "از پنل درگاه (بخش تنظیمات حساب یا وب‌سرویس، API Key). کلید ذخیره‌شده نمایش داده نمی‌شود؛ برای تغییر، کلید تازه را بنویسید."
        }
        render={({ field, id, aria }) => <Input id={id} disabled={!sms} {...secret} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="sms_sender"
        label={LABELS.sms_sender}
        required={sms}
        description="خط اختصاصی یا خط عمومی درگاه، مثل ۱۰۰۰۸۶۶۳."
        render={({ field, id, aria }) => (
          <Input id={id} dir="ltr" inputMode="numeric" disabled={!sms} {...field} onChange={(e) => field.onChange(onlyDigits(e.target.value))} {...aria} />
        )}
      />

      <Heading>ایمیل</Heading>
      <FormField
        control={form.control}
        name="email_enabled"
        label={LABELS.email_enabled}
        render={({ field, id }) => (
          <div className="flex min-h-7 items-center gap-2">
            <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
            <span className="text-xs text-muted-foreground">{field.value ? "فرستادن اعلان با ایمیل" : "خاموش"}</span>
          </div>
        )}
      />
      <FormField
        control={form.control}
        name="smtp_host"
        label={LABELS.smtp_host}
        required={email}
        description="سرور ایمیل سازمان، یا مثلاً smtp.gmail.com."
        render={({ field, id, aria }) => <Input id={id} dir="ltr" disabled={!email} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="smtp_port"
        label={LABELS.smtp_port}
        description="معمولاً ۵۸۷ برای STARTTLS و ۴۶۵ برای SSL."
        render={({ field, id, aria }) => (
          <Input
            id={id}
            dir="ltr"
            inputMode="numeric"
            className="max-w-28 text-start tabular-nums"
            disabled={!email}
            {...field}
            onChange={(e) => field.onChange(onlyDigits(e.target.value).slice(0, 5))}
            {...aria}
          />
        )}
      />
      <FormField
        control={form.control}
        name="smtp_security"
        label={LABELS.smtp_security}
        render={({ field, id, aria }) => (
          <Select value={field.value} onValueChange={field.onChange} disabled={!email}>
            <SelectTrigger id={id} className="w-full" {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starttls">STARTTLS</SelectItem>
              <SelectItem value="ssl">SSL/TLS</SelectItem>
              <SelectItem value="none">بدون رمزگذاری</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      <FormField
        control={form.control}
        name="smtp_username"
        label={LABELS.smtp_username}
        render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" disabled={!email} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="smtp_password"
        label={LABELS.smtp_password}
        description="برای Gmail «گذرواژه‌ی برنامه» (App password) لازم است، نه گذرواژه‌ی حساب. گذرواژه‌ی ذخیره‌شده نمایش داده نمی‌شود."
        render={({ field, id, aria }) => <Input id={id} disabled={!email} {...secret} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="from_email"
        label={LABELS.from_email}
        required={email}
        render={({ field, id, aria }) => <Input id={id} type="email" dir="ltr" disabled={!email} {...field} {...aria} />}
      />

      <Heading>پیوند در ایمیل‌ها</Heading>
      <FormField
        control={form.control}
        name="site_url"
        label={LABELS.site_url}
        description="نشانی‌ای که کاربران با آن سامانه را باز می‌کنند (همان که start.bat نشان می‌دهد)؛ ایمیل‌ها پیوند صفحه‌ی مرتبط را با آن می‌سازند."
        render={({ field, id, aria }) => <Input id={id} type="url" dir="ltr" {...field} {...aria} />}
      />
    </SettingsForm>
  )
}

function TestResult({ delivery }: { delivery: Delivery }) {
  const ok = delivery.status === "sent"
  return (
    <Alert variant={ok ? "default" : "destructive"} role="status">
      <AlertTitle>{ok ? `${delivery.channel_label} آزمایشی به ${toFaDigits(delivery.to)} فرستاده شد.` : `ارسال ${delivery.channel_label} آزمایشی ناموفق بود.`}</AlertTitle>
      {!ok && <AlertDescription>{delivery.error}</AlertDescription>}
    </Alert>
  )
}

function useGateways() {
  return useQuery({ queryKey: ["messaging", "gateways"], queryFn: () => unwrap(api.GET("/api/messaging/deliveries/gateways/")), staleTime: Infinity })
}

/** آزمون اتصال درگاه پیامک و ارسال آزمایشی بی‌درنگ، با تنظیمات ذخیره‌شده. */
function TestSection() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [mobile, setMobile] = React.useState(user?.mobile ?? "")
  const [email, setEmail] = React.useState(user?.email ?? "")
  const [result, setResult] = React.useState<Delivery | null>(null)
  const onDone = (d: Delivery) => {
    setResult(d)
    qc.invalidateQueries({ queryKey: DELIVERIES })
  }
  const testSms = useMutation({ mutationFn: () => unwrap(api.POST("/api/messaging/deliveries/test-sms/", { body: { mobile } })), onSuccess: onDone, onError: (e) => toast.error(errorMessage(e)) })
  const testEmail = useMutation({ mutationFn: () => unwrap(api.POST("/api/messaging/deliveries/test-email/", { body: { email } })), onSuccess: onDone, onError: (e) => toast.error(errorMessage(e)) })
  const connection = useMutation({ mutationFn: () => unwrap(api.POST("/api/messaging/deliveries/test-connection/")), onError: (e) => toast.error(errorMessage(e)) })
  const mobileId = React.useId()
  const emailId = React.useId()

  return (
    <Section
      title="ارسال آزمایشی"
      description="با تنظیمات ذخیره‌شده؛ اگر چیزی را تغییر داده‌اید، ابتدا ذخیره کنید. «آزمون اتصال» فقط اعتبار حساب درگاه را می‌خواند و پیامکی نمی‌فرستد."
    >
      <div className="flex flex-col gap-3">
        {connection.data && (
          <Alert variant={connection.data.ok ? "default" : "destructive"} role="status">
            <AlertTitle>{connection.data.message}</AlertTitle>
          </Alert>
        )}
        {result && <TestResult delivery={result} />}
        <div>
          <Button type="button" variant="outline" disabled={connection.isPending} onClick={() => connection.mutate()}>
            {connection.isPending ? <Spinner /> : <PlugZap />} آزمون اتصال درگاه پیامک
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={mobileId}>موبایل گیرنده</Label>
            <div className="flex gap-2">
              <DigitsInput id={mobileId} kind="mobile" value={mobile} onChange={setMobile} />
              <Button type="button" variant="outline" disabled={!mobile || testSms.isPending} onClick={() => testSms.mutate()}>
                {testSms.isPending ? <Spinner /> : <MessageSquare />} پیامک آزمایشی
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={emailId}>ایمیل گیرنده</Label>
            <div className="flex gap-2">
              <Input id={emailId} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="button" variant="outline" disabled={!email || testEmail.isPending} onClick={() => testEmail.mutate()}>
                {testEmail.isPending ? <Spinner /> : <Mail />} ایمیل آزمایشی
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

const EMPTY: Delivery[] = []
const col = columnHelper<Delivery>()
const TONE = { queued: "neutral", sent: "success", failed: "warning" } as const

function DeliveriesSection() {
  const view = useTableView("deliveries", { urlKey: "d.", defaultSort: "-created_at" })
  const list = useQuery({
    queryKey: [...DELIVERIES, view.query],
    queryFn: () => unwrap(api.GET("/api/messaging/deliveries/", { params: { query: view.query } })),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.results.some((d) => d.status === "queued") ? 3000 : false),
  })
  const columns = React.useMemo<DataTableColumn<Delivery>[]>(
    () => [
      col.accessor("created_at", { header: "زمان", meta: { label: "زمان" }, cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span> }),
      col.accessor("channel", {
        header: "کانال",
        enableSorting: false,
        meta: {
          label: "کانال",
          filterOptions: [
            { value: "sms", label: "پیامک" },
            { value: "email", label: "ایمیل" },
          ],
          exportValue: (d) => d.channel_label,
        },
        cell: (c) => c.row.original.channel_label,
      }),
      col.accessor("to", { header: "گیرنده", enableSorting: false, meta: { label: "گیرنده" }, cell: (c) => <bdi dir="ltr">{toFaDigits(c.getValue())}</bdi> }),
      col.accessor("user_name", { header: "کاربر", enableSorting: false, meta: { label: "کاربر" } }),
      col.accessor("text", { header: "متن", enableSorting: false, meta: { label: "متن", primary: true, wrap: true } }),
      col.accessor("status", {
        header: "وضعیت",
        enableSorting: false,
        meta: {
          label: "وضعیت",
          filterOptions: [
            { value: "sent", label: "ارسال شد" },
            { value: "failed", label: "ناموفق" },
            { value: "queued", label: "در صف" },
          ],
          exportValue: (d) => (d.error ? `${d.status_label}: ${d.error}` : d.status_label),
        },
        cell: (c) => (
          <span className="flex flex-col items-start gap-1">
            <StatusBadge tone={TONE[c.row.original.status]}>{c.row.original.status_label}</StatusBadge>
            {c.row.original.error && <span className="text-2xs whitespace-normal text-destructive">{c.row.original.error}</span>}
          </span>
        ),
      }),
    ],
    []
  )
  const table = useDataTable({ view, columns, data: list.data?.results ?? EMPTY, rowCount: list.data?.count ?? 0, getRowId: (d) => String(d.id) })

  return (
    <Section title="گزارش ارسال‌ها" description="هر پیامک و ایمیل اعلان‌ها و ارسال‌های آزمایشی؛ ارسال ناموفق تا سه بار دوباره تلاش می‌شود.">
      <DataTable
        table={table}
        view={view}
        caption="گزارش ارسال‌ها"
        loading={list.isFetching && !list.data}
        error={list.error}
        onRetry={() => list.refetch()}
        searchPlaceholder="گیرنده یا متن"
        exportFileName="گزارش ارسال‌ها"
        empty={{ title: "هنوز پیامک یا ایمیلی فرستاده نشده است" }}
      />
    </Section>
  )
}
