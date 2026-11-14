import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { countRule } from "./count-rule"
import { SettingsForm, SettingsLoader, UnitInput, type SectionInfo } from "./settings-form"

type Monitoring = Schemas["MonitoringSettings"]
type Name = keyof Monitoring
const KEY = ["settings", "monitoring"]

const LABELS: Record<Name, string> = {
  disk_min_free_gb: "کمترین فضای خالی دیسک",
  backup_max_age_days: "بیشترین فاصله از آخرین پشتیبان",
  errors_per_hour: "سقف خطای سامانه در یک ساعت",
  repeat_hours: "تکرار هشدار پابرجا",
}
/** بازه، واحد و راهنمای هر مقدار (همان بازه‌های سرور). */
const FIELDS: { name: Name; low: number; high: number; unit: string; help: string }[] = [
  { name: "disk_min_free_gb", low: 1, high: 10000, unit: "گیگابایت", help: "اگر فضای خالی دیسکی که پوشه‌ی داده‌ی نیک‌یار روی آن است کمتر از این شود، هشدار داده می‌شود." },
  { name: "backup_max_age_days", low: 1, high: 90, unit: "روز", help: "اگر از آخرین پشتیبان (روزانه یا دستی) بیش از این گذشته باشد، هشدار داده می‌شود؛ مثلاً وقتی پشتیبان روزانه شکست می‌خورد یا خاموش است." },
  { name: "errors_per_hour", low: 1, high: 10000, unit: "خطا", help: "اگر در یک ساعت این تعداد خطای سامانه (درخواست ناموفق یا کار پس‌زمینه‌ی ناموفق) رخ دهد، هشدار داده می‌شود." },
  { name: "repeat_hours", low: 1, high: 720, unit: "ساعت", help: "مشکلی که برطرف نشده، پس از این مدت دوباره یادآوری می‌شود. به‌روزرسانی ناموفق فقط یک‌بار هشدار دارد." },
]
const schema = z.object(Object.fromEntries(FIELDS.map((f) => [f.name, countRule(LABELS[f.name], f.low, f.high, f.unit)])) as Record<Name, ReturnType<typeof countRule>>)
const toForm = (d: Monitoring) => Object.fromEntries(FIELDS.map((f) => [f.name, String(d[f.name])])) as Record<Name, string>

export function MonitoringSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/monitoring/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <MonitoringForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function MonitoringForm({ section, data }: { section: SectionInfo; data: Monitoring }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["MonitoringSettingsRequest"]) => unwrap(api.PUT("/api/settings/monitoring/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      qc.invalidateQueries({ queryKey: ["monitoring"] })
      form.reset(toForm(saved))
      toast.success("تنظیمات پایش و هشدار ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(Object.fromEntries(FIELDS.map((f) => [f.name, Number(v[f.name])])) as Monitoring)
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
