import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { countRule } from "@/pages/admin/settings/count-rule"
import { SettingsForm, SettingsLoader, UnitInput, type SectionInfo } from "@/pages/admin/settings/settings-form"

type Service = Schemas["HrServiceSettings"]
const KEY = ["settings", "hr-service"]
const LABELS = { contract_reminder_days: "یادآوری پیش از پایان قرارداد" }
const schema = z.object({ contract_reminder_days: countRule(LABELS.contract_reminder_days, 1, 180, "روز") })
const toForm = (d: Service) => ({ contract_reminder_days: String(d.contract_reminder_days) })

export function HrServiceSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/hr-service/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <ServiceForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function ServiceForm({ section, data }: { section: SectionInfo; data: Service }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["HrServiceSettingsRequest"]) => unwrap(api.PUT("/api/settings/hr-service/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toForm(saved))
      toast.success("تنظیمات دوران خدمت ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ contract_reminder_days: Number(v.contract_reminder_days) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <FormField
        control={form.control}
        name="contract_reminder_days"
        label={LABELS.contract_reminder_days}
        required
        description="این چند روز پیش از «پایان قرارداد» هر کارمند (در زبانه‌ی «استخدام» پرونده)، به کارشناسان منابع انسانی و مدیر مستقیمش اعلان می‌رود که «تمدید قرارداد» را ثبت کنند؛ یک بار برای هر تاریخ پایان."
        render={({ field, id, aria }) => <UnitInput id={id} unit="روز" digits={3} {...field} {...aria} />}
      />
    </SettingsForm>
  )
}
