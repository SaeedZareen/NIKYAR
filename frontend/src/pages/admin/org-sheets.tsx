// پانل‌های ویرایش ساختار سازمانی: واحد، سمت و انتصاب.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { JalaliDateInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { UserPicker } from "@/components/user-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { toJalaliString } from "@/lib/format"
import { schemas } from "@/lib/validators"

export type Unit = Schemas["OrgUnit"]
export type Position = Schemas["Position"]
type SheetProps = { open: boolean; onOpenChange: (open: boolean) => void }

const ROOT = "root"

function SwitchField({ id, checked, onChange, on, off }: { id: string; checked: boolean; onChange: (v: boolean) => void; on: string; off: string }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <span className="text-xs text-muted-foreground">{checked ? on : off}</span>
    </div>
  )
}

/* ---------------- واحد ---------------- */

const unitSchema = z.object({
  name: schemas.required("عنوان واحد"),
  code: z.string().regex(/^[\w-]*$/, "کد فقط حروف لاتین، رقم، خط تیره و زیرخط است."),
  parent: z.string(),
  is_active: z.boolean(),
})
const UNIT_LABELS = { name: "عنوان واحد", code: "کد", parent: "واحد بالادست", is_active: "فعال" }

/** واحد جدید (با بالادست پیشنهادی) یا ویرایش واحد. */
export function UnitSheet({ unit, parentId, units, ...sheet }: SheetProps & { unit: Unit | null; parentId: number | null; units: Unit[] }) {
  const isNew = !unit
  const qc = useQueryClient()
  const form = useAppForm(unitSchema, {
    name: unit?.name ?? "",
    code: unit?.code ?? "",
    parent: String(unit ? (unit.parent ?? ROOT) : (parentId ?? ROOT)),
    is_active: unit?.is_active ?? true,
  })
  const save = useMutation({
    mutationFn: (body: Schemas["OrgUnitRequest"]) =>
      isNew ? unwrap(api.POST("/api/org/units/", { body })) : unwrap(api.PATCH("/api/org/units/{id}/", { params: { path: { id: unit.id } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["org"] })
      toast.success(isNew ? `واحد «${saved.name}» ایجاد شد.` : `واحد «${saved.name}» ذخیره شد.`)
      sheet.onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async ({ parent, ...v }) => {
    try {
      await save.mutateAsync({ ...v, parent: parent === ROOT ? null : Number(parent) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const parents = units.filter((u) => u.id !== unit?.id)

  return (
    <FormSheet {...sheet} title={isNew ? "واحد جدید" : `ویرایش «${unit.name}»`} onSubmit={onSubmit} submitting={save.isPending}>
      <ErrorSummary errors={form.formState.errors} labels={UNIT_LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField control={form.control} name="name" label="عنوان واحد" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="code"
          label="کد"
          description="اختیاری؛ برای گزارش‌ها و یکپارچگی با سامانه‌های دیگر."
          render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="parent"
          label="واحد بالادست"
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT}>بدون بالادست (بالاترین سطح)</SelectItem>
                {parents.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormField
          control={form.control}
          name="is_active"
          label="فعال"
          render={({ field, id }) => <SwitchField id={id} checked={field.value} onChange={field.onChange} on="در ساختار فعلی سازمان" off="بایگانی‌شده" />}
        />
      </FormGrid>
    </FormSheet>
  )
}

/* ---------------- سمت ---------------- */

const positionSchema = z.object({ title: schemas.required("عنوان سمت"), is_manager: z.boolean(), is_active: z.boolean() })
const POSITION_LABELS = { title: "عنوان سمت", is_manager: "مدیر واحد", is_active: "فعال" }

export function PositionSheet({ position, unit, ...sheet }: SheetProps & { position: Position | null; unit: Unit }) {
  const isNew = !position
  const qc = useQueryClient()
  const form = useAppForm(positionSchema, {
    title: position?.title ?? "",
    is_manager: position?.is_manager ?? false,
    is_active: position?.is_active ?? true,
  })
  const save = useMutation({
    mutationFn: (body: Schemas["PositionRequest"]) =>
      isNew ? unwrap(api.POST("/api/org/positions/", { body })) : unwrap(api.PATCH("/api/org/positions/{id}/", { params: { path: { id: position.id } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["org"] })
      toast.success(isNew ? `سمت «${saved.title}» ایجاد شد.` : `سمت «${saved.title}» ذخیره شد.`)
      sheet.onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ ...v, unit: unit.id })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <FormSheet {...sheet} title={isNew ? `سمت جدید در «${unit.name}»` : `ویرایش سمت «${position.title}»`} onSubmit={onSubmit} submitting={save.isPending}>
      <ErrorSummary errors={form.formState.errors} labels={POSITION_LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField control={form.control} name="title" label="عنوان سمت" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="is_manager"
          label="مدیر واحد"
          description="مدیر مستقیم کارکنان این واحد؛ هر واحد یک مدیر فعال دارد."
          render={({ field, id }) => <SwitchField id={id} checked={field.value} onChange={field.onChange} on="سمت مدیریتی" off="سمت کارشناسی" />}
        />
        <FormField
          control={form.control}
          name="is_active"
          label="فعال"
          render={({ field, id }) => <SwitchField id={id} checked={field.value} onChange={field.onChange} on="قابل انتصاب" off="غیرفعال" />}
        />
      </FormGrid>
    </FormSheet>
  )
}

/* ---------------- انتصاب ---------------- */

const assignSchema = z.object({
  user: z.object({ id: z.number(), name: z.string() }).nullable().refine((u) => u !== null, "کاربر را انتخاب کنید."),
  start_date: schemas.jalaliDate.refine((v) => v !== "", "تاریخ شروع را وارد کنید."),
  is_primary: z.boolean(),
})
const ASSIGN_LABELS = { user: "کاربر", start_date: "تاریخ شروع", is_primary: "سمت اصلی" }

export function AssignSheet({ position, ...sheet }: SheetProps & { position: Position }) {
  const qc = useQueryClient()
  const form = useAppForm(assignSchema, { user: null, start_date: toJalaliString(new Date()), is_primary: true })
  const save = useMutation({
    mutationFn: (body: Schemas["AssignmentRequest"]) => unwrap(api.POST("/api/org/assignments/", { body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["org"] })
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success(`«${saved.user_name}» در سمت «${position.title}» منصوب شد.`)
      sheet.onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ user: v.user!.id, position: position.id, start_date: v.start_date, is_primary: v.is_primary })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <FormSheet {...sheet} title={`انتصاب در سمت «${position.title}»`} description={position.unit_name} onSubmit={onSubmit} submitting={save.isPending} submitLabel="انتصاب">
      <ErrorSummary errors={form.formState.errors} labels={ASSIGN_LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField
          control={form.control}
          name="user"
          label="کاربر"
          required
          render={({ field, id, aria }) => <UserPicker id={id} value={field.value} onChange={field.onChange} {...aria} />}
        />
        <FormField
          control={form.control}
          name="start_date"
          label="تاریخ شروع"
          required
          render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
        />
        <FormField
          control={form.control}
          name="is_primary"
          label="سمت اصلی"
          description="کاربری که چند سمت دارد، کارهایش بر اساس سمت اصلی ارجاع می‌شود."
          render={({ field, id }) => <SwitchField id={id} checked={field.value} onChange={field.onChange} on="سمت اصلی کاربر" off="سمت فرعی" />}
        />
      </FormGrid>
    </FormSheet>
  )
}
