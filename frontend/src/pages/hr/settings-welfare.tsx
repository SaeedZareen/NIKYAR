import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { MoneyInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Switch } from "@/components/ui/switch"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { countRule } from "@/pages/admin/settings/count-rule"
import { SettingsForm, SettingsLoader, UnitInput, type SectionInfo } from "@/pages/admin/settings/settings-form"

type Welfare = Schemas["HrWelfareSettings"]
type Money = "advance_max" | "loan_max" | "medical_yearly_max" | "marriage_allowance" | "birth_allowance" | "death_allowance"
type Count = "advance_per_year" | "loan_max_installments"
const KEY = ["settings", "hr-welfare"]

const LABELS = {
  advance_max: "سقف هر مساعده",
  advance_per_year: "شمار مساعده در سال",
  loan_max: "سقف وام",
  loan_max_installments: "بیشترین شمار اقساط وام",
  loan_needs_guarantor: "وام ضامن لازم دارد",
  medical_yearly_max: "سقف بازپرداخت درمان در سال",
  marriage_allowance: "کمک‌هزینه‌ی ازدواج",
  birth_allowance: "کمک‌هزینه‌ی تولد فرزند",
  death_allowance: "کمک‌هزینه‌ی فوت بستگان",
}
const MONEY: { name: Money; help: string }[] = [
  { name: "advance_max", help: "درخواست مساعده‌ی بیش از این پذیرفته نمی‌شود." },
  { name: "loan_max", help: "درخواست وام بیش از این پذیرفته نمی‌شود." },
  { name: "medical_yearly_max", help: "جمع بازپرداخت‌های درمان هر کارمند در یک سال." },
  { name: "marriage_allowance", help: "مبلغی که با تأیید درخواست «کمک‌هزینه» از نوع ازدواج پرداخت و در پرونده ثبت می‌شود؛ هر کارمند یک بار." },
  { name: "birth_allowance", help: "مبلغ کمک‌هزینه‌ی تولد هر فرزند." },
  { name: "death_allowance", help: "مبلغ کمک‌هزینه‌ی فوت بستگان درجه‌ی یک." },
]
const COUNTS: Record<Count, { low: number; high: number; unit: string; help: string }> = {
  advance_per_year: { low: 0, high: 24, unit: "بار", help: "بیش از این شمار در یک سال، درخواست مساعده پذیرفته نمی‌شود." },
  loan_max_installments: { low: 1, high: 120, unit: "قسط", help: "بیشترین شمار اقساطی که کارمند می‌تواند انتخاب کند." },
}
const money = (label: string) => z.string().refine((v) => v !== "", `تکمیل «${label}» الزامی است.`)
const schema = z.object({
  ...(Object.fromEntries(MONEY.map((m) => [m.name, money(LABELS[m.name])])) as Record<Money, ReturnType<typeof money>>),
  advance_per_year: countRule(LABELS.advance_per_year, 0, 24, "بار"),
  loan_max_installments: countRule(LABELS.loan_max_installments, 1, 120, "قسط"),
  loan_needs_guarantor: z.boolean(),
})
const toForm = (d: Welfare) => ({
  ...(Object.fromEntries(MONEY.map((m) => [m.name, String(d[m.name])])) as Record<Money, string>),
  advance_per_year: String(d.advance_per_year),
  loan_max_installments: String(d.loan_max_installments),
  loan_needs_guarantor: d.loan_needs_guarantor,
})

export function HrWelfareSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/hr-welfare/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <WelfareForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function WelfareForm({ section, data }: { section: SectionInfo; data: Welfare }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["HrWelfareSettingsRequest"]) => unwrap(api.PUT("/api/settings/hr-welfare/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toForm(saved))
      toast.success("تنظیمات مالی و رفاه ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        ...(Object.fromEntries(MONEY.map((m) => [m.name, Number(v[m.name])])) as Record<Money, number>),
        advance_per_year: Number(v.advance_per_year),
        loan_max_installments: Number(v.loan_max_installments),
        loan_needs_guarantor: v.loan_needs_guarantor,
      })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const moneyField = (name: Money) => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      label={LABELS[name]}
      required
      description={MONEY.find((m) => m.name === name)?.help}
      render={({ field, id, aria }) => <MoneyInput id={id} currency="ریال" className="max-w-72" {...field} {...aria} />}
    />
  )
  const count = (name: Count) => (
    <FormField
      control={form.control}
      name={name}
      label={LABELS[name]}
      required
      description={COUNTS[name].help}
      render={({ field, id, aria }) => <UnitInput id={id} unit={COUNTS[name].unit} digits={String(COUNTS[name].high).length} {...field} {...aria} />}
    />
  )
  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      {moneyField("advance_max")}
      {count("advance_per_year")}
      {moneyField("loan_max")}
      {count("loan_max_installments")}
      <FormField
        control={form.control}
        name="loan_needs_guarantor"
        label={LABELS.loan_needs_guarantor}
        description="اگر روشن باشد، درخواست وام بی انتخاب ضامن پذیرفته نمی‌شود."
        render={({ field, id }) => (
          <div className="flex min-h-7 items-center gap-2">
            <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
            <span className="text-xs text-muted-foreground">{field.value ? "بله" : "خیر"}</span>
          </div>
        )}
      />
      {moneyField("medical_yearly_max")}
      {moneyField("marriage_allowance")}
      {moneyField("birth_allowance")}
      {moneyField("death_allowance")}
    </SettingsForm>
  )
}
