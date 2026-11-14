import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { countRule } from "./count-rule"
import { SettingsForm, SettingsLoader, UnitInput, type SectionInfo } from "./settings-form"

type System = Schemas["SystemSettings"]
type Name = Exclude<keyof System, "password_mixed" | "two_factor" | "two_factor_roles" | "password_reset_sms">
const KEY = ["settings", "system"]

const LABELS: Record<keyof System, string> = {
  session_hours: "مدت اعتبار ورود",
  login_rate: "سقف تلاش ورود در دقیقه",
  submit_rate: "سقف ثبت نهایی فرم در دقیقه",
  quick_link_days: "اعتبار پیوند تأیید سریع",
  jobs_keep_days: "نگه‌داری سابقه‌ی کارهای سامانه",
  password_min_length: "کمترین طول گذرواژه",
  password_mixed: "گذرواژه با حرف و رقم",
  password_expire_days: "اعتبار گذرواژه",
  lockout_attempts: "قفل پس از تلاش ناموفق",
  lockout_minutes: "مدت قفل",
  idle_minutes: "پایان نشست پس از بی‌کاری",
  two_factor: "رمز دوم پیامکی",
  two_factor_roles: "نقش‌های نیازمند رمز دوم",
  password_reset_sms: "فراموشی گذرواژه با کد پیامکی",
}
/** بازه، واحد و راهنمای هر مقدار (همان بازه‌های سرور). */
const FIELDS: { name: Name; low: number; high: number; unit: string; help: string }[] = [
  { name: "session_hours", low: 1, high: 720, unit: "ساعت", help: "پس از این مدت از ورود، کاربر باید دوباره وارد شود. برای نشست‌های تازه اعمال می‌شود." },
  { name: "login_rate", low: 3, high: 1000, unit: "بار", help: "تلاش ورود بیش از این از یک رایانه در یک دقیقه پذیرفته نمی‌شود (در برابر حدس گذرواژه)." },
  { name: "submit_rate", low: 1, high: 1000, unit: "بار", help: "ثبت نهایی فرم بیش از این از یک کاربر در یک دقیقه پذیرفته نمی‌شود (در برابر ثبت انبوه و خودکار)." },
  { name: "quick_link_days", low: 1, high: 30, unit: "روز", help: "پیوند «تأیید با یک کلیک» در ایمیل کار تازه پس از این مدت باطل می‌شود." },
  { name: "jobs_keep_days", low: 1, high: 365, unit: "روز", help: "سابقه‌ی کارهای پایان‌یافته در «کارهای سامانه» پس از این مدت خودکار پاک می‌شود." },
  { name: "password_min_length", low: 6, high: 64, unit: "نویسه", help: "گذرواژه‌های تازه دست‌کم این طول را دارند؛ گذرواژه‌های فعلی تا تغییر بعدی می‌مانند." },
  { name: "password_expire_days", low: 0, high: 365, unit: "روز", help: "پس از این مدت از آخرین تغییر، کاربر پیش از هر کار باید گذرواژه را عوض کند. صفر یعنی گذرواژه منقضی نمی‌شود." },
  { name: "lockout_attempts", low: 0, high: 100, unit: "بار", help: "پس از این تعداد ورود ناموفق پیاپی، حساب برای «مدت قفل» بسته می‌شود و به کاربر اعلان می‌رود؛ راهبر در «کاربران» آن را زودتر باز می‌کند. صفر یعنی خاموش." },
  { name: "lockout_minutes", low: 1, high: 1440, unit: "دقیقه", help: "مدتی که حساب پس از تلاش‌های ناموفق قفل می‌ماند." },
  { name: "idle_minutes", low: 0, high: 1440, unit: "دقیقه", help: "اگر کاربر این مدت کاری نکند (کلید، کلیک)، یک دقیقه پیش از آن هشدار می‌بیند و سپس خارج می‌شود. صفر یعنی خاموش." },
]
const schema = z.object({
  ...(Object.fromEntries(FIELDS.map((f) => [f.name, countRule(LABELS[f.name], f.low, f.high, f.unit)])) as Record<Name, ReturnType<typeof countRule>>),
  password_mixed: z.boolean(),
  two_factor: z.enum(["off", "roles", "all"]),
  two_factor_roles: z.array(z.number()),
  password_reset_sms: z.boolean(),
})
const toForm = (d: System) => ({
  ...(Object.fromEntries(FIELDS.map((f) => [f.name, String(d[f.name])])) as Record<Name, string>),
  password_mixed: d.password_mixed,
  two_factor: d.two_factor,
  two_factor_roles: d.two_factor_roles,
  password_reset_sms: d.password_reset_sms,
})

export function SystemSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/system/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <SystemForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function SystemForm({ section, data }: { section: SectionInfo; data: System }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const twoFactor = form.watch("two_factor")
  const roles = useQuery({ queryKey: ["role-lookup"], queryFn: () => unwrap(api.GET("/api/auth/role-lookup/")) })
  const save = useMutation({
    mutationFn: (body: Schemas["SystemSettingsRequest"]) => unwrap(api.PUT("/api/settings/system/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toForm(saved))
      toast.success("تنظیمات سامانه و امنیت ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const counts = Object.fromEntries(FIELDS.map((f) => [f.name, Number(v[f.name])])) as Record<Name, number>
      await save.mutateAsync({ ...counts, password_mixed: v.password_mixed, two_factor: v.two_factor, two_factor_roles: v.two_factor_roles, password_reset_sms: v.password_reset_sms })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      {FIELDS.map((f) => (
        <FormField
          key={f.name}
          control={form.control}
          name={f.name}
          label={LABELS[f.name]}
          required
          description={f.help}
          render={({ field, id, aria }) => <UnitInput id={id} unit={f.unit} digits={String(f.high).length} {...field} {...aria} />}
        />
      ))}
      <FormField
        control={form.control}
        name="password_mixed"
        label={LABELS.password_mixed}
        description="گذرواژه‌های تازه باید هم حرف و هم رقم داشته باشند."
        render={({ field, id }) => (
          <div className="flex min-h-7 items-center gap-2">
            <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
            <span className="text-xs text-muted-foreground">{field.value ? "لازم است" : "لازم نیست"}</span>
          </div>
        )}
      />
      <FormField
        control={form.control}
        name="two_factor"
        label={LABELS.two_factor}
        description="پس از گذرواژه‌ی درست، کد شش‌رقمی به موبایل کاربر پیامک می‌شود و ورود با آن کامل می‌شود. نیاز به درگاه پیامک و موبایل ثبت‌شده‌ی کاربران دارد. متن یا الگوی پیامک در «متن اعلان‌ها › کد ورود»."
        render={({ field, id, aria }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} className="w-full" {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">خاموش</SelectItem>
              <SelectItem value="roles">برای نقش‌های انتخاب‌شده</SelectItem>
              <SelectItem value="all">برای همه</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      {twoFactor === "roles" && (
        <FormField
          control={form.control}
          name="two_factor_roles"
          label={LABELS.two_factor_roles}
          required
          group
          description="مثلاً مدیران و کسانی که به پشتیبان‌گیری یا تنظیمات دسترسی دارند."
          render={({ field, id, aria }) => (
            <div id={id} role="group" tabIndex={-1} className="flex flex-col gap-2 pt-1 outline-none" {...aria}>
              {(roles.data ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`tf-role-${r.id}`}
                    checked={field.value.includes(r.id)}
                    onCheckedChange={(on) => field.onChange(on ? [...field.value, r.id] : field.value.filter((x) => x !== r.id))}
                  />
                  <Label htmlFor={`tf-role-${r.id}`} className="font-normal">
                    {r.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
        />
      )}
      <FormField
        control={form.control}
        name="password_reset_sms"
        label={LABELS.password_reset_sms}
        description="پیوند «گذرواژه را فراموش کرده‌ام» در صفحه‌ی ورود: کد به موبایل ثبت‌شده‌ی کاربر پیامک می‌شود و او گذرواژه‌ی تازه می‌گذارد. فقط وقتی درگاه پیامک تنظیم باشد نمایش داده می‌شود. کاربران Active Directory گذرواژه را در ویندوز عوض می‌کنند."
        render={({ field, id }) => (
          <div className="flex min-h-7 items-center gap-2">
            <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
            <span className="text-xs text-muted-foreground">{field.value ? "روشن" : "خاموش"}</span>
          </div>
        )}
      />
    </SettingsForm>
  )
}
