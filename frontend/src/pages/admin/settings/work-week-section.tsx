import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CALENDAR_KEY } from "@/app/work-calendar"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"
import { formToWeek, WEEK_LABELS, weekSchema, weekToForm } from "./work-week"
import { WorkWeekTable } from "./work-week-table"

const KEY = ["settings", "work-week"]

export function WorkWeekSection({ section }: { section: SectionInfo }) {
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(api.GET("/api/settings/work-week/")),
  })
  return (
    <SettingsLoader section={section} query={query}>
      {(week) => <WorkWeekForm section={section} week={week} />}
    </SettingsLoader>
  )
}

function WorkWeekForm({ section, week }: { section: SectionInfo; week: Schemas["WorkWeekSettings"] }) {
  const qc = useQueryClient()
  const form = useAppForm(weekSchema, weekToForm(week.days))
  const save = useMutation({
    mutationFn: (body: Schemas["WorkWeekSettingsRequest"]) => unwrap(api.PUT("/api/settings/work-week/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      qc.invalidateQueries({ queryKey: CALENDAR_KEY })
      form.reset(weekToForm(saved.days))
      toast.success("روزها و ساعت کاری ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ days: formToWeek(v) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <SettingsForm section={section} form={form} labels={WEEK_LABELS} onSubmit={onSubmit} saving={save.isPending} grid={false}>
      <WorkWeekTable form={form} />
    </SettingsForm>
  )
}
