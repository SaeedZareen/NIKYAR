import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { CALENDAR_KEY, type Holiday } from "@/app/work-calendar"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { JalaliDateInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDate } from "@/lib/format"
import { schemas } from "@/lib/validators"

const KINDS = { organization: "خاص سازمان", official: "رسمی" } as const
const schema = z.object({
  date: schemas.jalaliDate.refine((v) => v !== "", "تکمیل «تاریخ» الزامی است."),
  title: schemas.required("عنوان"),
  kind: z.enum(["official", "organization"]),
})
const LABELS = { date: "تاریخ", title: "عنوان", kind: "نوع" }

type Props = {
  holiday: Holiday | null
  /** تاریخ پیشنهادی برای تعطیلی جدید (کلیک روی روزی از تقویم). */
  date?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (holiday: Holiday) => void
}

export function HolidaySheet({ holiday, date, onDelete, ...sheet }: Props) {
  const isNew = !holiday
  const qc = useQueryClient()
  const form = useAppForm(schema, { date: holiday?.date ?? date ?? "", title: holiday?.title ?? "", kind: holiday?.kind ?? "organization" })
  const save = useMutation({
    mutationFn: (body: Schemas["HolidayRequest"]) =>
      isNew ? unwrap(api.POST("/api/calendar/holidays/", { body })) : unwrap(api.PATCH("/api/calendar/holidays/{id}/", { params: { path: { id: holiday.id } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: CALENDAR_KEY })
      toast.success(`«${saved.title}» (${formatDate(saved.date, "long")}) ${isNew ? "به تعطیلات اضافه شد." : "ذخیره شد."}`)
      sheet.onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <FormSheet
      {...sheet}
      title={isNew ? "تعطیلی جدید" : `ویرایش «${holiday.title}»`}
      onSubmit={onSubmit}
      submitting={save.isPending}
      secondaryAction={
        holiday && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => onDelete(holiday)}>
            <Trash2 /> حذف
          </Button>
        )
      }
    >
      <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField
          control={form.control}
          name="date"
          label={LABELS.date}
          required
          render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
        />
        <FormField control={form.control} name="title" label={LABELS.title} required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="kind"
          label={LABELS.kind}
          description="تعطیلات رسمی از تقویم کشور می‌آیند؛ «خاص سازمان» برای روزهایی است که فقط این سازمان تعطیل است."
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KINDS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormGrid>
    </FormSheet>
  )
}
