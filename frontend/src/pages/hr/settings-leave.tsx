import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { useLookupItems } from "@/app/lookups"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { TimeInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"
import { countRule } from "@/pages/admin/settings/count-rule"
import { SettingsForm, SettingsLoader, UnitInput, type SectionInfo } from "@/pages/admin/settings/settings-form"

type Leave = Schemas["HrLeaveSettings"]
type LeaveType = Schemas["LeaveType"]
const KEY = ["settings", "hr-leave"]
const put = (body: Schemas["HrLeaveSettingsRequest"]) => unwrap(api.PUT("/api/settings/hr-leave/", { body }))

export function HrLeaveSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/hr-leave/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => (
        <div className="flex flex-col gap-4">
          <QuotaForm section={section} data={data} />
          <LeaveTypes data={data} />
        </div>
      )}
    </SettingsLoader>
  )
}

// —— سهمیه، تردد و اضافه‌کار ——

type Count = "annual_days" | "carryover_max" | "overtime_daily_max" | "overtime_monthly_max" | "attendance_fix_days"
const LABELS = {
  annual_days: "مرخصی استحقاقی سالانه",
  by_type: "سهمیه‌ی نوع‌های استخدام",
  prorate_first_year: "سهمیه‌ی سال اول به نسبت کارکرد",
  carryover_max: "سقف انتقال مانده به سال بعد",
  day_length: "مدت هر روز مرخصی",
  allow_negative: "اجازه‌ی مانده‌ی منفی",
  overtime_daily_max: "سقف اضافه‌کار در روز",
  overtime_monthly_max: "سقف اضافه‌کار در ماه",
  attendance_fix_days: "مهلت ثبت اصلاح تردد",
}
const COUNTS: Record<Count, { low: number; high: number; unit: string; help: string }> = {
  annual_days: { low: 0, high: 365, unit: "روز", help: "پیش‌فرض قانون کار ۲۶ روز کاری در سال است." },
  carryover_max: { low: 0, high: 365, unit: "روز", help: "مانده‌ی بیش از این در پایان سال به سال بعد نمی‌رود. قانون کار تا ۹ روز را اجازه می‌دهد." },
  overtime_daily_max: { low: 0, high: 24, unit: "ساعت", help: "درخواست اضافه‌کار بیش از این در یک روز پذیرفته نمی‌شود. قانون کار تا ۴ ساعت در روز را اجازه می‌دهد." },
  overtime_monthly_max: { low: 0, high: 744, unit: "ساعت", help: "جمع اضافه‌کار تأییدشده‌ی هر کارمند در یک ماه." },
  attendance_fix_days: { low: 0, high: 60, unit: "روز", help: "درخواست «اصلاح تردد» تا این چند روز پس از روز موردنظر پذیرفته می‌شود." },
}
const countSchema = Object.fromEntries(Object.entries(COUNTS).map(([n, c]) => [n, countRule(LABELS[n as Count], c.low, c.high, c.unit)])) as Record<
  Count,
  ReturnType<typeof countRule>
>
const quotaSchema = z.object({
  ...countSchema,
  by_type: z.record(
    z.string(),
    z.string().refine((v) => v === "" || Number(v) <= 365, "حداکثر ۳۶۵ روز.")
  ),
  prorate_first_year: z.boolean(),
  day_length: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "مدت را به شکل ۰۸:۰۰ وارد کنید.")
    .refine((v) => v !== "00:00", "مدت را به شکل ۰۸:۰۰ وارد کنید."),
  allow_negative: z.boolean(),
})
const toQuota = (d: Leave) => ({
  ...(Object.fromEntries(Object.keys(COUNTS).map((n) => [n, String(d[n as Count])])) as Record<Count, string>),
  by_type: Object.fromEntries(Object.entries(d.annual_days_by_type).map(([k, v]) => [k, String(v)])),
  prorate_first_year: d.prorate_first_year,
  day_length: d.day_length,
  allow_negative: d.allow_negative,
})

function QuotaForm({ section, data }: { section: SectionInfo; data: Leave }) {
  const qc = useQueryClient()
  const kinds = useLookupItems("employment-type").data ?? []
  const form = useAppForm(quotaSchema, toQuota(data))
  const save = useMutation({
    mutationFn: put,
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(toQuota(saved))
      toast.success("تنظیمات مرخصی و تردد ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async ({ by_type, ...v }) => {
    const latest = qc.getQueryData<Leave>(KEY) ?? data
    try {
      await save.mutateAsync({
        ...v,
        ...(Object.fromEntries(Object.keys(COUNTS).map((n) => [n, Number(v[n as Count])])) as Record<Count, number>),
        annual_days_by_type: Object.fromEntries(Object.entries(by_type).flatMap(([k, d]) => (d === "" ? [] : [[k, Number(d)]]))),
        leave_types: latest.leave_types,
      })
    } catch (e) {
      applyServerErrors(form, e, (name) => (name === "annual_days_by_type" ? "by_type" : name))
    }
  })
  const count = (name: Count, required = true) => (
    <FormField
      control={form.control}
      name={name}
      label={LABELS[name]}
      required={required}
      description={COUNTS[name].help}
      render={({ field, id, aria }) => <UnitInput id={id} unit={COUNTS[name].unit} digits={String(COUNTS[name].high).length} {...field} {...aria} />}
    />
  )
  const toggle = (name: "prorate_first_year" | "allow_negative", help: string) => (
    <FormField
      control={form.control}
      name={name}
      label={LABELS[name]}
      description={help}
      render={({ field, id }) => (
        <div className="flex min-h-7 items-center gap-2">
          <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
          <span className="text-xs text-muted-foreground">{field.value ? "بله" : "خیر"}</span>
        </div>
      )}
    />
  )
  const general = form.watch("annual_days")

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      {count("annual_days")}
      {toggle("prorate_first_year", "کارمندی که میانه‌ی سال استخدام شده، به نسبت ماه‌های باقی‌مانده‌ی سال سهمیه می‌گیرد.")}
      {count("carryover_max")}
      <FormField
        control={form.control}
        name="day_length"
        label={LABELS.day_length}
        required
        description="برای تبدیل مرخصی ساعتی به روز؛ مثلاً با ۰۸:۰۰، هشت ساعت مرخصی ساعتی یک روز از مانده کم می‌کند."
        render={({ field, id, aria }) => <TimeInput id={id} {...field} {...aria} />}
      />
      {toggle("allow_negative", "اگر روشن باشد، کارمند می‌تواند بیش از مانده‌اش مرخصی استحقاقی بگیرد و مانده منفی می‌شود.")}
      {count("overtime_daily_max")}
      {count("overtime_monthly_max")}
      {count("attendance_fix_days")}
      {kinds.length > 0 && (
        <fieldset className="col-span-full flex flex-col gap-3">
          <legend className="pb-2 text-xs font-semibold">{LABELS.by_type}</legend>
          <FormGrid>
            {kinds.map((k) => (
              <FormField
                key={k.code}
                control={form.control}
                name={`by_type.${k.code}`}
                label={k.title}
                description="خالی یعنی همان سهمیه‌ی عمومی."
                render={({ field, id, aria }) => (
                  <UnitInput id={id} unit="روز" placeholder={toFaDigits(general)} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} {...aria} />
                )}
              />
            ))}
          </FormGrid>
        </fieldset>
      )}
    </SettingsForm>
  )
}

// —— نوع‌های مرخصی ——

const col = columnHelper<LeaveType>()
const days = (n: number | null | undefined) => (n == null ? "—" : `${toFaDigits(n)} روز`)
const attachment = (n: number | null) => (n == null ? "لازم نیست" : n === 0 ? "همیشه" : `بیش از ${toFaDigits(n)} روز`)

function LeaveTypes({ data }: { data: Leave }) {
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState<{ row: LeaveType | null } | null>(null)
  const [deleting, setDeleting] = React.useState<LeaveType | null>(null)
  const remove = useMutation({
    mutationFn: (row: LeaveType) => put({ ...data, leave_types: data.leave_types.filter((t) => t.code !== row.code) }),
    onSuccess: (saved, row) => {
      qc.setQueryData(KEY, saved)
      toast.success(`نوع مرخصی «${row.title}» حذف شد.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns = React.useMemo<DataTableColumn<LeaveType>[]>(
    () => [
      col.accessor("title", {
        header: "نوع مرخصی",
        meta: { label: "نوع مرخصی", primary: true },
        cell: (c) => (
          <span className="inline-flex flex-wrap items-center gap-1">
            {c.getValue()}
            {!c.row.original.enabled && <StatusBadge tone="neutral">خاموش</StatusBadge>}
          </span>
        ),
      }),
      col.accessor("paid", { header: "حقوق", meta: { label: "حقوق" }, cell: (c) => (c.getValue() ? "با حقوق" : "بدون حقوق") }),
      col.accessor("deducts", { header: "کسر از مانده", meta: { label: "کسر از مانده" }, cell: (c) => (c.getValue() ? "بله" : "خیر") }),
      col.accessor("max_per_request", { header: "سقف هر درخواست", meta: { label: "سقف هر درخواست" }, cell: (c) => <span className="tabular-nums">{days(c.getValue())}</span> }),
      col.accessor("max_per_year", { header: "سقف سالانه", meta: { label: "سقف سالانه" }, cell: (c) => <span className="tabular-nums">{days(c.getValue())}</span> }),
      col.accessor("attachment_over", { header: "پیوست", meta: { label: "پیوست" }, cell: (c) => attachment(c.getValue()) }),
      actionsColumn<LeaveType>((row) => (
        <>
          <DropdownMenuItem onSelect={() => setEditing({ row })}>
            <Pencil /> ویرایش
          </DropdownMenuItem>
          {!row.builtin && (
            <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(row)}>
              <Trash2 /> حذف
            </DropdownMenuItem>
          )}
        </>
      )),
    ],
    []
  )
  const view = useTableView("hr-leave-types")
  const table = useDataTable({ view, columns, data: data.leave_types, getRowId: (t) => t.code })

  return (
    <Section
      title="نوع‌های مرخصی"
      description="نوع‌هایی که کارکنان در فرم مرخصی انتخاب می‌کنند. نوع‌های پایه حذف نمی‌شوند ولی می‌توان خاموششان کرد؛ «استحقاقی» مبنای مانده‌ی مرخصی است."
      actions={
        <Button variant="outline" size="sm" onClick={() => setEditing({ row: null })}>
          <Plus /> افزودن نوع مرخصی
        </Button>
      }
    >
      <DataTable table={table} view={view} caption="نوع‌های مرخصی" compact empty={{ title: "نوع مرخصی تعریف نشده است" }} />
      {editing && <LeaveTypeSheet data={data} row={editing.row} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`نوع مرخصی «${deleting.title}» حذف شود؟`}
          description="از این پس در فرم مرخصی دیده نمی‌شود. اگر فقط موقتاً لازم نیست، به‌جای حذف خاموشش کنید."
          confirmLabel="حذف"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </Section>
  )
}

const TYPE_LABELS = {
  title: "عنوان",
  enabled: "فعال",
  paid: "با حقوق",
  deducts: "کسر از مانده‌ی مرخصی",
  max_per_request: "سقف هر درخواست",
  max_per_year: "سقف در سال",
  attachment: "پیوست (مثل گواهی پزشک)",
  attachment_over: "پیوست لازم برای بیش از",
}
const optionalDays = z.string().refine((v) => v === "" || Number(v) <= 365, "حداکثر ۳۶۵ روز.")
const typeSchema = z
  .object({
    title: z.string().trim().min(1, "تکمیل «عنوان» الزامی است.").max(60, "عنوان حداکثر ۶۰ نویسه است."),
    enabled: z.boolean(),
    paid: z.boolean(),
    deducts: z.boolean(),
    max_per_request: optionalDays,
    max_per_year: optionalDays,
    attachment: z.enum(["never", "always", "over"]),
    attachment_over: optionalDays,
  })
  .refine((v) => v.attachment !== "over" || Number(v.attachment_over) >= 1, { path: ["attachment_over"], message: "شمار روزها را وارد کنید." })
const optional = (n: number | null | undefined) => (n == null ? "" : String(n))
const toNumber = (v: string) => (v === "" ? null : Number(v))

function LeaveTypeSheet({ data, row, onClose }: { data: Leave; row: LeaveType | null; onClose: () => void }) {
  const qc = useQueryClient()
  const annual = row?.code === "annual"
  const form = useAppForm(typeSchema, {
    title: row?.title ?? "",
    enabled: row?.enabled ?? true,
    paid: row?.paid ?? true,
    deducts: row?.deducts ?? false,
    max_per_request: optional(row?.max_per_request),
    max_per_year: optional(row?.max_per_year),
    attachment: row?.attachment_over == null ? "never" : row.attachment_over === 0 ? "always" : "over",
    attachment_over: row?.attachment_over ? String(row.attachment_over) : "",
  })
  const save = useMutation({
    mutationFn: put,
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      toast.success(row ? "نوع مرخصی ویرایش شد." : "نوع مرخصی افزوده شد.")
      onClose()
    },
  })
  const onSubmit = form.handleSubmit(async ({ attachment, attachment_over, ...v }) => {
    const item = {
      code: row?.code ?? "",
      title: v.title,
      enabled: v.enabled,
      paid: v.paid,
      deducts: v.deducts,
      max_per_request: toNumber(v.max_per_request),
      max_per_year: toNumber(v.max_per_year),
      attachment_over: attachment === "never" ? null : attachment === "always" ? 0 : toNumber(attachment_over),
    }
    const leave_types = row ? data.leave_types.map((t) => (t.code === row.code ? item : t)) : [...data.leave_types, item]
    try {
      await save.mutateAsync({ ...data, leave_types })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const mode = form.watch("attachment")
  const toggle = (name: "enabled" | "paid" | "deducts", disabled = false) => (
    <FormField
      control={form.control}
      name={name}
      label={TYPE_LABELS[name]}
      render={({ field, id }) => (
        <div className="flex min-h-7 items-center gap-2">
          <Switch id={id} checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
          <span className="text-xs text-muted-foreground">{field.value ? "بله" : "خیر"}</span>
        </div>
      )}
    />
  )
  const daysField = (name: "max_per_request" | "max_per_year", help: string) => (
    <FormField
      control={form.control}
      name={name}
      label={TYPE_LABELS[name]}
      description={help}
      render={({ field, id, aria }) => <UnitInput id={id} unit="روز" placeholder="بدون سقف" {...field} {...aria} />}
    />
  )

  return (
    <FormSheet open onOpenChange={(o) => !o && onClose()} title={row ? `ویرایش مرخصی ${row.title}` : "افزودن نوع مرخصی"} onSubmit={onSubmit} submitting={save.isPending}>
      <ErrorSummary errors={form.formState.errors} labels={TYPE_LABELS} submitCount={form.formState.submitCount} />
      <FormGrid columns={1}>
        <FormField control={form.control} name="title" label={TYPE_LABELS.title} required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        {toggle("enabled", annual)}
        {toggle("paid")}
        {toggle("deducts", annual)}
        {daysField("max_per_request", "بیشترین روز در یک درخواست؛ خالی یعنی بدون سقف.")}
        {daysField("max_per_year", "بیشترین روز در یک سال؛ خالی یعنی بدون سقف.")}
        <FormField
          control={form.control}
          name="attachment"
          label={TYPE_LABELS.attachment}
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full max-w-56" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">لازم نیست</SelectItem>
                <SelectItem value="always">همیشه لازم است</SelectItem>
                <SelectItem value="over">برای بیش از چند روز</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {mode === "over" && (
          <FormField
            control={form.control}
            name="attachment_over"
            label={TYPE_LABELS.attachment_over}
            required
            render={({ field, id, aria }) => <UnitInput id={id} unit="روز" {...field} {...aria} />}
          />
        )}
      </FormGrid>
    </FormSheet>
  )
}
