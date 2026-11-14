import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PlugZap } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"

type Directory = Schemas["DirectorySettings"]
const KEY = ["settings", "directory"]

const schema = z.object({
  enabled: z.boolean(),
  server_url: z.string().trim(),
  start_tls: z.boolean(),
  bind_user: z.string().trim(),
  bind_password: z.string(),
  base_dn: z.string().trim(),
  user_filter: z.string().trim(),
  allowed_groups: z.string(),
  auto_create: z.boolean(),
})
const LABELS = {
  enabled: "ورود با Active Directory",
  server_url: "نشانی سرور",
  start_tls: "رمزگذاری با StartTLS",
  bind_user: "حساب جست‌وجو",
  bind_password: "گذرواژه‌ی حساب جست‌وجو",
  base_dn: "ریشه‌ی جست‌وجو",
  user_filter: "فیلتر کاربر",
  allowed_groups: "گروه‌های مجاز",
  auto_create: "ساخت خودکار کاربر",
}
const toForm = (d: Directory) => ({ ...d, allowed_groups: d.allowed_groups.join("\n") })

function Toggle({ value, onChange, id, on, off }: { value: boolean; onChange: (v: boolean) => void; id: string; on: string; off: string }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <Switch id={id} checked={value} onCheckedChange={onChange} />
      <span className="text-xs text-muted-foreground">{value ? on : off}</span>
    </div>
  )
}

/** «تنظیمات › ورود با Active Directory»: سرور، حساب جست‌وجو، گروه‌های مجاز و آزمون اتصال. */
export function DirectorySection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/directory/")) })
  return (
    <div className="flex flex-col gap-4">
      <SettingsLoader section={section} query={query}>
        {(data) => <DirectoryForm section={section} data={data} />}
      </SettingsLoader>
      <TestSection />
    </div>
  )
}

function DirectoryForm({ section, data }: { section: SectionInfo; data: Directory }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["DirectorySettingsRequest"]) => unwrap(api.PUT("/api/settings/directory/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toForm(saved))
      toast.success("تنظیمات ورود با Active Directory ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ ...v, allowed_groups: v.allowed_groups.split("\n").map((g) => g.trim()).filter(Boolean) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const enabled = form.watch("enabled")
  const ltr = { dir: "ltr" as const, autoComplete: "off", spellCheck: false }

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <FormField
        control={form.control}
        name="enabled"
        label={LABELS.enabled}
        description="کاربران محلی نیک‌یار (مثل admin) همچنان با گذرواژه‌ی نیک‌یار وارد می‌شوند؛ بقیه با نام کاربری و گذرواژه‌ی ویندوز."
        render={({ field, id }) => <Toggle id={id} value={field.value} onChange={field.onChange} on="روشن" off="خاموش" />}
      />
      <FormField
        control={form.control}
        name="server_url"
        label={LABELS.server_url}
        required={enabled}
        description="مثل ldap://dc1.example.local یا ldaps://dc1.example.local:636 (رمزگذاری‌شده). از واحد فناوری بپرسید."
        render={({ field, id, aria }) => <Input id={id} {...ltr} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="start_tls"
        label={LABELS.start_tls}
        description="برای ldap:// روی درگاه ۳۸۹، اگر سرور StartTLS دارد؛ با ldaps:// لازم نیست."
        render={({ field, id }) => <Toggle id={id} value={field.value} onChange={field.onChange} on="روشن" off="خاموش" />}
      />
      <FormField
        control={form.control}
        name="bind_user"
        label={LABELS.bind_user}
        required={enabled}
        description="حسابی فقط‌خواندنی برای یافتن کاربران، مثل nikyar-svc@example.local."
        render={({ field, id, aria }) => <Input id={id} {...ltr} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="bind_password"
        label={LABELS.bind_password}
        required={enabled}
        description="گذرواژه‌ی ذخیره‌شده نمایش داده نمی‌شود؛ برای تغییر، گذرواژه‌ی تازه را بنویسید."
        render={({ field, id, aria }) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="base_dn"
        label={LABELS.base_dn}
        required={enabled}
        description="جایی از دامنه که کاربران زیر آن جست‌وجو می‌شوند، مثل DC=example,DC=local یا OU=Staff,DC=example,DC=local."
        render={({ field, id, aria }) => <Input id={id} {...ltr} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="user_filter"
        label={LABELS.user_filter}
        required
        description="پیش‌فرض برای Active Directory مناسب است؛ {username} نام کاربری واردشده است. برای ورود با ایمیل: (userPrincipalName={username})."
        render={({ field, id, aria }) => <Input id={id} {...ltr} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="allowed_groups"
        label={LABELS.allowed_groups}
        className="col-span-full"
        description="DN گروه‌هایی که اجازه‌ی ورود دارند، هر کدام در یک سطر (عضویت تودرتو هم پذیرفته است). خالی یعنی همه‌ی کاربران زیر ریشه‌ی جست‌وجو."
        render={({ field, id, aria }) => <Textarea id={id} rows={3} {...ltr} placeholder="CN=NIKYAR Users,OU=Groups,DC=example,DC=local" {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="auto_create"
        label={LABELS.auto_create}
        description="کاربر AD در نخستین ورود خودکار ساخته می‌شود (نام، ایمیل و موبایل از AD) و نقش‌هایش را راهبر در «کاربران» می‌دهد. خاموش: فقط کاربرانی که راهبر از پیش ساخته است."
        render={({ field, id }) => <Toggle id={id} value={field.value} onChange={field.onChange} on="روشن" off="خاموش" />}
      />
    </SettingsForm>
  )
}

/** آزمون اتصال با تنظیمات ذخیره‌شده؛ با نام کاربری، یافتن او و عضویتش در گروه‌های مجاز. */
function TestSection() {
  const [username, setUsername] = React.useState("")
  const test = useMutation({ mutationFn: () => unwrap(api.POST("/api/auth/directory/test/", { body: { username } })), onError: (e) => toast.error(errorMessage(e)) })
  const id = React.useId()
  return (
    <Section title="آزمون اتصال" description="با تنظیمات ذخیره‌شده؛ اگر چیزی را تغییر داده‌اید، ابتدا ذخیره کنید. گذرواژه‌ی کاربر لازم نیست.">
      <div className="flex flex-col gap-3">
        {test.data && (
          <Alert variant={test.data.ok ? "default" : "destructive"} role="status">
            <AlertTitle>{test.data.message}</AlertTitle>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>نام کاربری نمونه (اختیاری)</Label>
          <div className="flex gap-2">
            <Input id={id} dir="ltr" autoComplete="off" className="max-w-60" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Button type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? <Spinner /> : <PlugZap />} آزمون اتصال
            </Button>
          </div>
        </div>
      </div>
    </Section>
  )
}
