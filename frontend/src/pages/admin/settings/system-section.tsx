import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { countRule } from "./count-rule"
import { SettingsForm, SettingsLoader, UnitInput, type SectionInfo } from "./settings-form"

type System = Schemas["SystemSettings"]
type Name = keyof System
const KEY = ["settings", "system"]

const LABELS: Record<Name, string> = {
  session_hours: "مدت اعتبار ورود",
  login_rate: "سقف تلاش ورود در دقیقه",
  submit_rate: "سقف ثبت نهایی فرم در دقیقه",
  quick_link_days: "اعتبار پیوند تأیید سریع",
  jobs_keep_days: "نگه‌داری سابقه‌ی کارهای سامانه",
}
/** بازه، واحد و راهنمای هر مقدار (همان بازه‌های سرور). */
const FIELDS: { name: Name; low: number; high: number; unit: string; help: string }[] = [
  { name: "session_hours", low: 1, high: 720, unit: "ساعت", help: "پس از این مدت از ورود، کاربر باید دوباره وارد شود. برای نشست‌های تازه اعمال می‌شود." },
  { name: "login_rate", low: 3, high: 1000, unit: "بار", help: "تلاش ورود بیش از این از یک رایانه در یک دقیقه پذیرفته نمی‌شود (در برابر حدس گذرواژه)." },
  { name: "submit_rate", low: 1, high: 1000, unit: "بار", help: "ثبت نهایی فرم بیش از این از یک کاربر در یک دقیقه پذیرفته نمی‌شود (در برابر ثبت انبوه و خودکار)." },
  { name: "quick_link_days", low: 1, high: 30, unit: "روز", help: "پیوند «تأیید با یک کلیک» در ایمیل کار تازه پس از این مدت باطل می‌شود." },
  { name: "jobs_keep_days", low: 1, high: 365, unit: "روز", help: "سابقه‌ی کارهای پایان‌یافته در «کارهای سامانه» پس از این مدت خودکار پاک می‌شود." },
]
const schema = z.object(Object.fromEntries(FIELDS.map((f) => [f.name, countRule(LABELS[f.name], f.low, f.high, f.unit)])) as Record<Name, ReturnType<typeof countRule>>)
const toForm = (d: System) => Object.fromEntries(FIELDS.map((f) => [f.name, String(d[f.name])])) as Record<Name, string>

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
      await save.mutateAsync(Object.fromEntries(FIELDS.map((f) => [f.name, Number(v[f.name])])) as System)
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
    </SettingsForm>
  )
}
