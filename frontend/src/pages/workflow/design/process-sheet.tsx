import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"
import { useLookupItems } from "@/app/lookups"
import { DESIGN_PROCESSES_KEY, useRoleOptions } from "@/app/forms"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { SearchPicker } from "@/components/search-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api, unwrap, type Schemas } from "@/lib/api/client"

type Process = Schemas["Process"]

const schema = z.object({
  title: z.string().trim().min(1, "تکمیل «عنوان» الزامی است.").max(150, "حداکثر ۱۵۰ نویسه."),
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, "شناسه با حرف کوچک لاتین شروع می‌شود و فقط حرف کوچک لاتین، رقم و - دارد."),
  form: z.string().min(1, "فرم اصلی را انتخاب کنید."),
  category: z.string(),
  description: z.string().trim().max(500, "حداکثر ۵۰۰ نویسه."),
  is_active: z.boolean(),
  start_by_everyone: z.boolean(),
  start_roles: z.array(z.string()),
  admin_roles: z.array(z.string()),
  number_pattern: z.string().max(60, "الگو حداکثر ۶۰ نویسه است."),
  number_reset: z.enum(["never", "year", "fiscal"]),
})
type Values = z.output<typeof schema>
const LABELS = {
  title: "عنوان",
  code: "شناسه",
  form: "فرم اصلی",
  category: "دسته",
  description: "توضیح",
  is_active: "فعال",
  start_by_everyone: "همه‌ی کاربران شروع کنند",
  start_roles: "نقش‌های شروع‌کننده",
  admin_roles: "مدیران فرایند",
  number_pattern: "الگوی شماره‌ی درخواست",
  number_reset: "شروع دوباره‌ی شماره",
}

/** فرایند تازه یا ویرایش مشخصات آن (گیرنده‌ها، شروع‌کنندگان و شماره‌گذاری در فرایندساز). */
export function ProcessSheet({ process, open, onOpenChange }: { process: Process | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const forms = useQuery({ queryKey: ["workflow", "form-options"], queryFn: () => unwrap(api.GET("/api/workflow/processes/form-options/")) })
  const categories = useLookupItems("process-category").data ?? []
  const roles = useRoleOptions()
  const form = useAppForm(schema, {
    title: process?.title ?? "",
    code: process?.code ?? "",
    form: process ? String(process.form) : "",
    category: process?.category ? String(process.category) : "",
    description: process?.description ?? "",
    is_active: process?.is_active ?? true,
    start_by_everyone: process?.start_by_everyone ?? false,
    start_roles: (process?.start_roles ?? []).map(String),
    admin_roles: (process?.admin_roles ?? []).map(String),
    number_pattern: process?.number_pattern ?? "",
    number_reset: (process?.number_reset ?? "year") as "never" | "year" | "fiscal",
  })
  const everyone = form.watch("start_by_everyone")
  const numbered = form.watch("number_pattern").trim() !== ""
  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        title: v.title,
        code: v.code,
        form: Number(v.form),
        category: v.category ? Number(v.category) : null,
        description: v.description,
        is_active: v.is_active,
        start_by_everyone: v.start_by_everyone,
        start_roles: v.start_roles.map(Number),
        admin_roles: v.admin_roles.map(Number),
        number_pattern: v.number_pattern.trim(),
        number_reset: v.number_reset,
      }
      return process
        ? unwrap(api.PATCH("/api/workflow/processes/{id}/", { params: { path: { id: String(process.id) } }, body }))
        : unwrap(api.POST("/api/workflow/processes/", { body }))
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: DESIGN_PROCESSES_KEY })
      onOpenChange(false)
      if (process) toast.success("مشخصات فرایند ذخیره شد.")
      else {
        toast.success(`فرایند «${saved.title}» ساخته شد.`)
        navigate(`/workflow/design/${saved.id}`)
      }
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const formOptions = (forms.data ?? []).map((f) => ({ value: String(f.id), label: f.title }))

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={process ? "مشخصات فرایند" : "فرایند جدید"}
      description="داده‌ی هر درخواست با «فرم اصلی» پر و سنجیده می‌شود؛ مرحله‌ها، گیرنده‌ها و مسیرها را در فرایندساز می‌کشید."
      onSubmit={onSubmit}
      submitting={save.isPending}
    >
      <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField control={form.control} name="title" label={LABELS.title} required render={({ field, id, aria }) => <Input id={id} maxLength={150} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="code"
          label={LABELS.code}
          required
          description="شناسه‌ی لاتین و پایدار فرایند (مثلاً purchase)؛ پس از ساخت تغییر نمی‌کند."
          render={({ field, id, aria }) => <Input id={id} dir="ltr" maxLength={40} disabled={!!process} {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="form"
          label={LABELS.form}
          required
          description="فرمی از فرم‌ساز که درخواست‌دهنده پر می‌کند؛ فقط فرم‌های منتشرشده."
          render={({ field, id, aria }) => (
            <SearchPicker id={id} options={formOptions} value={field.value} onChange={(v) => field.onChange(v as string)} onBlur={field.onBlur} placeholder="انتخاب فرم" emptyText="فرم منتشرشده‌ای نیست؛ ابتدا در فرم‌ساز بسازید." {...aria} />
          )}
        />
        <FormField
          control={form.control}
          name="category"
          label={LABELS.category}
          render={({ field, id, aria }) => (
            <SearchPicker id={id} options={categories.map((c) => ({ value: String(c.id), label: c.title }))} value={field.value} onChange={(v) => field.onChange(v as string)} onBlur={field.onBlur} placeholder="بی‌دسته" {...aria} />
          )}
        />
        <FormField control={form.control} name="description" label={LABELS.description} render={({ field, id, aria }) => <Input id={id} maxLength={500} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="is_active"
          label={LABELS.is_active}
          description="فرایند غیرفعال درخواست تازه نمی‌پذیرد؛ درخواست‌های در جریان تا پایان می‌روند."
          render={({ field, id, aria }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} {...aria} />}
        />
        <FormField
          control={form.control}
          name="start_by_everyone"
          label={LABELS.start_by_everyone}
          description="خاموش: فقط دارندگان «نقش‌های شروع‌کننده» درخواست تازه می‌سازند."
          render={({ field, id, aria }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} {...aria} />}
        />
        {!everyone && (
          <FormField
            control={form.control}
            name="start_roles"
            label={LABELS.start_roles}
            render={({ field, id, aria }) => <SearchPicker id={id} options={roles} multiple value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="انتخاب نقش‌ها" {...aria} />}
          />
        )}
        <FormField
          control={form.control}
          name="admin_roles"
          label={LABELS.admin_roles}
          description="کاری که قاعده‌ی گیرنده‌اش به کسی نرسد به این نقش‌ها سپرده می‌شود و هشدار می‌دهد؛ مدیریت درخواست‌ها و گزارش این فرایند هم با آن‌هاست."
          render={({ field, id, aria }) => <SearchPicker id={id} options={roles} multiple value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="انتخاب نقش‌ها" {...aria} />}
        />
        <FormField
          control={form.control}
          name="number_pattern"
          label={LABELS.number_pattern}
          description="هر درخواست شماره‌ی پیگیری یکتا با شمارنده‌ی همین فرایند می‌گیرد؛ خالی یعنی بی‌شماره. نشانه‌ها: {year} سال، {yy} دو رقم سال، {fyear} سال مالی، {month} ماه، {seq:4} شمارنده با چهار رقم. نمونه: خر-{year}-{seq:4}"
          render={({ field, id, aria }) => <Input id={id} dir="auto" className="text-start" placeholder="خر-{year}-{seq:4}" {...field} {...aria} />}
        />
        {numbered && (
          <FormField
            control={form.control}
            name="number_reset"
            label={LABELS.number_reset}
            render={({ field, id, aria }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">آغاز هر سال شمسی</SelectItem>
                  <SelectItem value="fiscal">آغاز هر سال مالی</SelectItem>
                  <SelectItem value="never">هرگز (ادامه‌دار)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        )}
      </FormGrid>
    </FormSheet>
  )
}
