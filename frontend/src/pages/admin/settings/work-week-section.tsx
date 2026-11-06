import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useFieldArray } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { CALENDAR_KEY, WEEKDAYS } from "@/app/work-calendar"
import { TimeInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Checkbox } from "@/components/ui/checkbox"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber } from "@/lib/format"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"

type WorkWeek = Schemas["WorkWeekSettings"]
const KEY = ["settings", "work-week"]
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const daySchema = z.object({ working: z.boolean(), start: z.string(), end: z.string() }).superRefine((d, ctx) => {
  if (!d.working) return
  if (!TIME.test(d.start))
    ctx.addIssue({
      code: "custom",
      path: ["start"],
      message: "ساعت شروع را به شکل ۰۸:۰۰ وارد کنید.",
    })
  else if (!TIME.test(d.end))
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "ساعت پایان را به شکل ۱۶:۰۰ وارد کنید.",
    })
  else if (d.start >= d.end)
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "ساعت پایان باید بعد از ساعت شروع باشد.",
    })
})
const schema = z.object({
  days: z.array(daySchema).refine((days) => days.some((d) => d.working), "دست‌کم یک روز کاری انتخاب کنید."),
})
type Values = z.input<typeof schema>

function toForm(week: WorkWeek): Values {
  return {
    days: WEEKDAYS.map((_, day) => {
      const d = week.days.find((x) => x.day === day)
      return {
        working: !!d,
        start: d?.start ?? "08:00",
        end: d?.end ?? "16:00",
      }
    }),
  }
}

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

function WorkWeekForm({ section, week }: { section: SectionInfo; week: WorkWeek }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(week))
  const { fields } = useFieldArray({ control: form.control, name: "days" })
  const save = useMutation({
    mutationFn: (body: Schemas["WorkWeekSettingsRequest"]) => unwrap(api.PUT("/api/settings/work-week/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      qc.invalidateQueries({ queryKey: CALENDAR_KEY })
      form.reset(toForm(saved))
      toast.success("روزها و ساعت کاری ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    const days = v.days.flatMap((d, day) => (d.working ? [{ day, start: d.start, end: d.end }] : []))
    try {
      await save.mutateAsync({ days })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const { errors, submitCount } = form.formState
  const labels = Object.fromEntries(
    WEEKDAYS.flatMap((w, i) => [
      [`days.${i}.start`, `شروع ${w}`],
      [`days.${i}.end`, `پایان ${w}`],
    ]),
  )

  return (
    <SettingsForm section={section} form={form} labels={{ ...labels, days: "روزهای کاری" }} onSubmit={onSubmit} saving={save.isPending} grid={false}>
      <table id="field-days" tabIndex={-1} className="w-full max-w-xl text-xs outline-none">
        <caption className="sr-only">ساعت کاری روزهای هفته</caption>
        <thead className="text-2xs text-muted-foreground">
          <tr>
            <th scope="col" className="pb-2 text-start font-normal">
              روز
            </th>
            <th scope="col" className="pb-2 text-start font-normal">
              شروع
            </th>
            <th scope="col" className="pb-2 text-start font-normal">
              پایان
            </th>
            <th scope="col" className="pb-2 text-start font-normal">
              <span className="sr-only">مدت</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => {
            const working = form.watch(`days.${i}.working`)
            const start = form.watch(`days.${i}.start`)
            const end = form.watch(`days.${i}.end`)
            const hours = TIME.test(start) && TIME.test(end) && start < end ? minutesBetween(start, end) / 60 : null
            const err = errors.days?.[i]
            return (
              <tr key={f.id} className="border-t">
                <td className="py-1.5 pe-3">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={working}
                      onCheckedChange={(v) =>
                        form.setValue(`days.${i}.working`, !!v, {
                          shouldDirty: true,
                        })
                      }
                    />
                    {WEEKDAYS[i]}
                  </label>
                </td>
                {(["start", "end"] as const).map((part) => (
                  <td key={part} className="py-1.5 pe-3">
                    <TimeInput
                      id={`field-days-${i}-${part}`}
                      aria-label={`${part === "start" ? "شروع" : "پایان"} ${WEEKDAYS[i]}`}
                      aria-invalid={!!err?.[part]}
                      disabled={!working}
                      value={form.watch(`days.${i}.${part}`)}
                      onChange={(v) =>
                        form.setValue(`days.${i}.${part}`, v, {
                          shouldDirty: true,
                          shouldValidate: submitCount > 0,
                        })
                      }
                    />
                  </td>
                ))}
                <td className="py-1.5 text-2xs text-muted-foreground">{working ? (hours ? `${formatNumber(hours)} ساعت` : "") : "تعطیل"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </SettingsForm>
  )
}

function minutesBetween(a: string, b: string) {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  return m(b) - m(a)
}
