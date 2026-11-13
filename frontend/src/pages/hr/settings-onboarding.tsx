import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { countRule } from "@/pages/admin/settings/count-rule"
import { SettingsForm, SettingsLoader, UnitInput, type SectionInfo } from "@/pages/admin/settings/settings-form"

type Onboarding = Schemas["HrOnboardingSettings"]
const KEY = ["settings", "hr-onboarding"]
const LABELS = { probation_days: "طول دوره‌ی آزمایشی", reminder_days: "یادآوری ارزیابی پیش از پایان دوره" }
const schema = z.object({ probation_days: countRule(LABELS.probation_days, 1, 365, "روز"), reminder_days: countRule(LABELS.reminder_days, 1, 60, "روز") })
const toForm = (d: Onboarding) => ({ probation_days: String(d.probation_days), reminder_days: String(d.reminder_days) })

export function HrOnboardingSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/hr-onboarding/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <OnboardingForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function OnboardingForm({ section, data }: { section: SectionInfo; data: Onboarding }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["HrOnboardingSettingsRequest"]) => unwrap(api.PUT("/api/settings/hr-onboarding/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toForm(saved))
      toast.success("تنظیمات ورود کارمند ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ probation_days: Number(v.probation_days), reminder_days: Number(v.reminder_days) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <FormField
        control={form.control}
        name="probation_days"
        label={LABELS.probation_days}
        required
        description="از تاریخ استخدام شمرده می‌شود؛ پایان آن در زبانه‌ی «استخدام» پرونده دیده می‌شود. قانون کار تا یک ماه برای کار ساده و تا سه ماه برای کار تخصصی را اجازه می‌دهد."
        render={({ field, id, aria }) => <UnitInput id={id} unit="روز" digits={3} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="reminder_days"
        label={LABELS.reminder_days}
        required
        description="این چند روز پیش از پایان دوره، به مدیر مستقیم کارمند اعلان می‌رود که «ارزیابی دوره‌ی آزمایشی» را ثبت کند (یک بار، اگر ارزیابی ثبت نشده باشد)."
        render={({ field, id, aria }) => <UnitInput id={id} unit="روز" digits={2} {...field} {...aria} />}
      />
    </SettingsForm>
  )
}
