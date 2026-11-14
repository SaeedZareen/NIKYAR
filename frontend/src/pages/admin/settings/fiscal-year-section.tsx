import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useWatch } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, addYears, getMonth, getYear, newDate } from "date-fns-jalali"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { MONTHS } from "@/app/work-calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDate } from "@/lib/format"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"

type Fiscal = Schemas["FiscalYearSettings"]
type Month = Schemas["StartMonthEnum"]
const KEY = ["settings", "fiscal-year"]

const schema = z.object({ start_month: z.string() })
const LABELS = { start_month: "ماه آغاز سال مالی" }

/** دوره‌ی مالی جاری: از ۱ ماه آغاز تا روز پیش از همان روز در سال بعد. */
function currentFiscalPeriod(startMonth: number, today = new Date()) {
  const year = getMonth(today) + 1 >= startMonth ? getYear(today) : getYear(today) - 1
  const start = newDate(year, startMonth - 1, 1)
  return { start, end: addDays(addYears(start, 1), -1) }
}

export function FiscalYearSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/fiscal-year/")) })
  return <SettingsLoader section={section} query={query}>{(fiscal) => <FiscalYearForm section={section} fiscal={fiscal} />}</SettingsLoader>
}

function FiscalYearForm({ section, fiscal }: { section: SectionInfo; fiscal: Fiscal }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, { start_month: String(fiscal.start_month) })
  const save = useMutation({
    mutationFn: (body: Schemas["FiscalYearSettingsRequest"]) => unwrap(api.PUT("/api/settings/fiscal-year/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset({ start_month: String(saved.start_month) })
      toast.success("سال مالی ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ start_month: Number(v.start_month) as Month })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const period = currentFiscalPeriod(Number(useWatch({ control: form.control, name: "start_month" })))

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <FormField
        control={form.control}
        name="start_month"
        label={LABELS.start_month}
        hint={`دوره‌ی مالی جاری: از ${formatDate(period.start, "long")} تا ${formatDate(period.end, "long")}`}
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
    </SettingsForm>
  )
}
