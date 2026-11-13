import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { useRoleOptions } from "@/app/forms"
import { FormField } from "@/components/form/form-field"
import { MoneyInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { SettingsForm, SettingsLoader, type SectionInfo } from "@/pages/admin/settings/settings-form"

type Roles = Schemas["HrRolesSettings"]
type RoleName = "hr_role" | "finance_role" | "ceo_role" | "it_role" | "assets_role"
const KEY = ["settings", "hr-roles"]
const NONE = "none"

const LABELS = {
  hr_role: "کارشناس منابع انسانی",
  finance_role: "امور مالی",
  ceo_role: "مدیرعامل",
  it_role: "فناوری اطلاعات",
  assets_role: "اموال و تدارکات",
  ceo_threshold: "سقف مبلغ بی نیاز به تأیید مدیرعامل",
}
const ROLES: { name: RoleName; help: string }[] = [
  { name: "hr_role", help: "اعضای این نقش مرحله‌ی «منابع انسانی» درخواست‌های پرسنلی را انجام می‌دهند." },
  { name: "finance_role", help: "اعضای این نقش مرحله‌ی «امور مالی» درخواست‌های مالی (مساعده، وام، هزینه‌ها) را انجام می‌دهند." },
  { name: "it_role", help: "اعضای این نقش در «تسویه‌حساب» تحویل رایانه، حساب‌ها و دسترسی‌های کارمند را تأیید می‌کنند." },
  { name: "assets_role", help: "اعضای این نقش در «تسویه‌حساب» بازگشت اموال و تجهیزات تحویلی را تأیید می‌کنند." },
  { name: "ceo_role", help: "تأیید درخواست‌های مالی بالاتر از سقف مبلغ. در غیاب مدیرعامل، جانشین تعیین‌شده در «جانشینی» کار را انجام می‌دهد." },
]
const schema = z.object({
  hr_role: z.string(),
  finance_role: z.string(),
  ceo_role: z.string(),
  it_role: z.string(),
  assets_role: z.string(),
  ceo_threshold: z.string().refine((v) => v !== "", "تکمیل «سقف مبلغ» الزامی است."),
})
const toForm = (d: Roles) => ({
  hr_role: d.hr_role ? String(d.hr_role) : NONE,
  finance_role: d.finance_role ? String(d.finance_role) : NONE,
  ceo_role: d.ceo_role ? String(d.ceo_role) : NONE,
  it_role: d.it_role ? String(d.it_role) : NONE,
  assets_role: d.assets_role ? String(d.assets_role) : NONE,
  ceo_threshold: String(d.ceo_threshold),
})

export function HrRolesSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/hr-roles/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <RolesForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function RolesForm({ section, data }: { section: SectionInfo; data: Roles }) {
  const qc = useQueryClient()
  const roles = useRoleOptions()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["HrRolesSettingsRequest"]) => unwrap(api.PUT("/api/settings/hr-roles/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toForm(saved))
      toast.success("نقش‌ها و سقف مبلغ منابع انسانی ذخیره شد.")
    },
  })
  const role = (v: string) => (v === NONE ? null : Number(v))
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        hr_role: role(v.hr_role),
        finance_role: role(v.finance_role),
        ceo_role: role(v.ceo_role),
        it_role: role(v.it_role),
        assets_role: role(v.assets_role),
        ceo_threshold: Number(v.ceo_threshold),
      })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      {ROLES.map((r) => (
        <FormField
          key={r.name}
          control={form.control}
          name={r.name}
          label={LABELS[r.name]}
          description={r.help}
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full max-w-72" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>تعیین نشده</SelectItem>
                {roles.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      ))}
      <FormField
        control={form.control}
        name="ceo_threshold"
        label={LABELS.ceo_threshold}
        required
        description="درخواست مالی تا این مبلغ با تأیید امور مالی پایان می‌یابد و بالاتر از آن تأیید مدیرعامل هم لازم است. مبلغ‌های فرم‌ها به ریال است."
        render={({ field, id, aria }) => <MoneyInput id={id} currency="ریال" className="max-w-72" {...field} {...aria} />}
      />
    </SettingsForm>
  )
}
