import type { UseFormReturn } from "react-hook-form"
import { useFieldArray } from "react-hook-form"
import { WEEKDAYS } from "@/app/work-calendar"
import { TIME, type WeekValues } from "./work-week"
import { TimeInput } from "@/components/form/inputs"
import { Checkbox } from "@/components/ui/checkbox"
import { formatNumber } from "@/lib/format"

/** جدول روزهای کاری هفته با ساعت شروع و پایان هر روز (تنظیمات «روزها و ساعت کاری» و راه‌اندازی نخستین). */
export function WorkWeekTable({ form }: { form: UseFormReturn<WeekValues> }) {
  const { fields } = useFieldArray({ control: form.control, name: "days" })
  const { errors, submitCount } = form.formState
  return (
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
  )
}

function minutesBetween(a: string, b: string) {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  return m(b) - m(a)
}
