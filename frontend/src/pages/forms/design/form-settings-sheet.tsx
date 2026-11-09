import * as React from "react"
import { useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Controller, type Control } from "react-hook-form"
import { X } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { DESIGN_FORMS_KEY, useRoleOptions } from "@/app/forms"
import { useLookupItems } from "@/app/lookups"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormSheet } from "@/components/form/form-sheet"
import { JalaliDateInput, TimeInput } from "@/components/form/inputs"
import { InfoTip } from "@/components/info-tip"
import { UserPicker } from "@/components/user-picker"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { SearchPicker } from "@/components/search-picker"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { onlyDigits, parseJalali, toEnDigits, toFaDigits, toJalaliString } from "@/lib/format"
import { schemas } from "@/lib/validators"

type DesignForm = Schemas["Form"]

const NO_CATEGORY = "none"
const schema = z.object({
  title: schemas.required("عنوان"),
  code: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, "شناسه با حرف کوچک لاتین شروع می‌شود و فقط حرف کوچک لاتین، رقم و - دارد (۲ تا ۴۰ نویسه)."),
  category: z.string(),
  description: z.string().max(500, "توضیح حداکثر ۵۰۰ نویسه است."),
  is_active: z.boolean(),
  fill_by_everyone: z.boolean(),
  fill_roles: z.array(z.string()),
  view_roles: z.array(z.string()),
  number_pattern: z.string().max(60, "الگو حداکثر ۶۰ نویسه است."),
  number_reset: z.enum(["never", "year", "fiscal"]),
  opens_date: z.string(),
  opens_time: z.string(),
  closes_date: z.string(),
  closes_time: z.string(),
  capacity: z.string(),
  per_user_limit: z.string(),
  per_user_period: z.enum(["ever", "day", "month", "year"]),
  edit_hours: z.string(),
  allow_drafts: z.boolean(),
  draft_days: z.string(),
  after_submit: z.enum(["forms", "page", "url"]),
  after_submit_url: z.string(),
  notify_submitter: z.boolean(),
  notify_users: z.array(z.number()),
  notify_roles: z.array(z.string()),
  anonymous: z.boolean(),
})

/** تاریخ و ساعت شمسی ← زمان ISO (خالی یعنی بی‌محدودیت). */
function toIso(date: string, time: string): string | null {
  const day = parseJalali(date)
  if (!day) return null
  const [h = 0, m = 0] = time.split(":").map(Number)
  day.setHours(h, m, 0, 0)
  return day.toISOString()
}
const datePart = (iso?: string | null) => (iso ? toJalaliString(new Date(iso)) : "")
const timePart = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
const int = (v: string) => (v.trim() === "" ? null : Number(toEnDigits(v)))
const text = (n?: number | null) => (n === null || n === undefined ? "" : String(n))
const LABELS = {
  title: "عنوان",
  code: "شناسه",
  category: "دسته",
  description: "توضیح",
  is_active: "فعال",
  fill_by_everyone: "همه‌ی کاربران پر کنند",
  fill_roles: "نقش‌های پرکننده",
  view_roles: "نقش‌های بیننده",
  number_pattern: "الگوی شماره",
  number_reset: "شروع دوباره‌ی شماره",
  opens_date: "آغاز پذیرش",
  closes_date: "پایان پذیرش",
  capacity: "ظرفیت کل",
  per_user_limit: "سقف ثبت هر کاربر",
  edit_hours: "ویرایش پس از ثبت",
  draft_days: "حذف پیش‌نویس پس از",
  after_submit_url: "نشانی پس از ثبت",
  anonymous: "بی‌نام",
}

/** فرم جدید یا تنظیمات فرم: عنوان، شناسه، دسته، چه کسانی پر کنند و چه کسانی همه‌ی ثبت‌ها را ببینند. */
export function FormSettingsSheet({ form, open, onOpenChange }: { form: DesignForm | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isNew = !form
  const qc = useQueryClient()
  const navigate = useNavigate()
  const categories = useLookupItems("form-category").data ?? []
  const roles = useRoleOptions()
  const [suggestedCode] = React.useState(() => `form-${Date.now().toString(36)}`)
  const values = useAppForm(schema, {
    title: form?.title ?? "",
    code: form?.code ?? suggestedCode,
    category: form?.category ? String(form.category) : NO_CATEGORY,
    description: form?.description ?? "",
    is_active: form?.is_active ?? true,
    fill_by_everyone: form?.fill_by_everyone ?? true,
    fill_roles: (form?.fill_roles ?? []).map(String),
    view_roles: (form?.view_roles ?? []).map(String),
    number_pattern: form?.number_pattern ?? "",
    number_reset: (form?.number_reset ?? "year") as "never" | "year" | "fiscal",
    opens_date: datePart(form?.opens_at),
    opens_time: timePart(form?.opens_at),
    closes_date: datePart(form?.closes_at),
    closes_time: timePart(form?.closes_at),
    capacity: text(form?.capacity),
    per_user_limit: text(form?.per_user_limit),
    per_user_period: (form?.per_user_period ?? "ever") as "ever" | "day" | "month" | "year",
    edit_hours: text(form?.edit_hours),
    allow_drafts: form?.allow_drafts ?? true,
    draft_days: text(form?.draft_days),
    after_submit: (form?.after_submit ?? "forms") as "forms" | "page" | "url",
    after_submit_url: form?.after_submit_url ?? "",
    notify_submitter: form?.notify_submitter ?? false,
    notify_users: form?.notify_users ?? [],
    notify_roles: (form?.notify_roles ?? []).map(String),
    anonymous: form?.anonymous ?? false,
  })
  const everyone = values.watch("fill_by_everyone")
  const numbered = values.watch("number_pattern").trim() !== ""
  const drafts = values.watch("allow_drafts")
  const afterSubmit = values.watch("after_submit")

  const save = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => {
      const { opens_date, opens_time, closes_date, closes_time, ...rest } = v
      const body = {
        ...rest,
        category: v.category === NO_CATEGORY ? null : Number(v.category),
        fill_roles: v.fill_roles.map(Number),
        view_roles: v.view_roles.map(Number),
        notify_roles: v.notify_roles.map(Number),
        opens_at: toIso(opens_date, opens_time),
        closes_at: toIso(closes_date, closes_time),
        capacity: int(v.capacity),
        per_user_limit: int(v.per_user_limit),
        edit_hours: int(v.edit_hours),
        draft_days: int(v.draft_days),
      }
      return isNew ? unwrap(api.POST("/api/forms/", { body })) : unwrap(api.PATCH("/api/forms/{id}/", { params: { path: { id: String(form.id) } }, body }))
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: DESIGN_FORMS_KEY })
      qc.invalidateQueries({ queryKey: ["forms", "available"] })
      toast.success(isNew ? `فرم «${saved.title}» ساخته شد.` : `تنظیمات «${saved.title}» ذخیره شد.`)
      onOpenChange(false)
      if (isNew) navigate(`/forms/design/${saved.id}`)
    },
  })
  const onSubmit = values.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(values, e, (name) => ({ opens_at: "opens_date", closes_at: "closes_date" })[name] ?? name)
    }
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "فرم جدید" : `تنظیمات «${form.title}»`}
      description="پس از ساخت، فیلدها را در طراح می‌چینید و فرم را منتشر می‌کنید."
      onSubmit={onSubmit}
      submitting={save.isPending}
      submitLabel={isNew ? "ساخت و رفتن به طراح" : "ذخیره"}
    >
      <ErrorSummary errors={values.formState.errors} labels={LABELS} submitCount={values.formState.submitCount} />
      <FieldGroup className="gap-3">
        <FormField control={values.control} name="title" label="عنوان" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField
          control={values.control}
          name="code"
          label="شناسه"
          required
          description="نام لاتین و پایدار فرم برای گزارش‌ها و فرایندها (مثل purchase-request)؛ پس از ساخت تغییر نمی‌کند."
          render={({ field, id, aria }) => <Input id={id} dir="ltr" className="text-start" disabled={!isNew} {...field} {...aria} />}
        />
        <FormField
          control={values.control}
          name="category"
          label="دسته"
          description="گروه‌بندی فرم‌ها در صفحه‌ی «فرم‌ها»؛ فهرست دسته‌ها در «فهرست‌های پایه» ویرایش می‌شود."
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>بدون دسته</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormField control={values.control} name="description" label="توضیح" render={({ field, id, aria }) => <Textarea id={id} rows={2} {...field} {...aria} />} />
        {!isNew && (
          <FormField
            control={values.control}
            name="is_active"
            label="فعال"
            description="فرم غیرفعال در صفحه‌ی «فرم‌ها» نمی‌آید و ثبت تازه نمی‌پذیرد؛ ثبت‌های گذشته می‌مانند."
            render={({ field, id }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} className="mt-1.5" />}
          />
        )}
        <FormField
          control={values.control}
          name="fill_by_everyone"
          label="همه‌ی کاربران پر کنند"
          render={({ field, id }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} className="mt-1.5" />}
        />
        {!everyone && (
          <FormField
            control={values.control}
            name="fill_roles"
            label="نقش‌های پرکننده"
            description="فقط کاربرانی که یکی از این نقش‌ها را دارند فرم را می‌بینند و پر می‌کنند."
            render={({ field, id, aria }) => <SearchPicker id={id} options={roles} multiple value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="انتخاب نقش‌ها" {...aria} />}
          />
        )}
        <FormField
          control={values.control}
          name="view_roles"
          label="نقش‌های بیننده"
          description="دارندگان این نقش‌ها همه‌ی ثبت‌های نهایی این فرم را می‌بینند (هر کس ثبت‌های خودش را همیشه می‌بیند)."
          render={({ field, id, aria }) => <SearchPicker id={id} options={roles} multiple value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="انتخاب نقش‌ها" {...aria} />}
        />
        <FormField
          control={values.control}
          name="number_pattern"
          label="الگوی شماره"
          description="هر ثبت نهایی شماره‌ی یکتا با شمارنده‌ی همین فرم می‌گیرد؛ خالی یعنی بی‌شماره. نشانه‌ها: {year} سال، {yy} دو رقم سال، {fyear} سال مالی، {month} ماه، {seq:4} شمارنده با چهار رقم. نمونه: خ-{year}-{seq:4}"
          render={({ field, id, aria }) => <Input id={id} dir="auto" className="text-start" placeholder="خ-{year}-{seq:4}" {...field} {...aria} />}
        />
        {numbered && (
          <FormField
            control={values.control}
            name="number_reset"
            label="شروع دوباره‌ی شماره"
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
      </FieldGroup>

      <SheetPart title="پذیرش و محدودیت‌ها" help="بی‌نیاز به انتشار و فوری اثر می‌کنند؛ صفحه‌ی «فرم‌ها» وضعیت فرم (بسته، تکمیل ظرفیت، پیش‌تر پر کرده‌اید) را نشان می‌دهد.">
        <DateTimeField control={values.control} date="opens_date" time="opens_time" label="آغاز پذیرش" description="پیش از این زمان فرم باز نمی‌شود؛ خالی یعنی از همین حالا." />
        <DateTimeField control={values.control} date="closes_date" time="closes_time" label="پایان پذیرش" description="پس از این زمان ثبت تازه پذیرفته نمی‌شود؛ خالی یعنی بی‌پایان." />
        <NumberField control={values.control} name="capacity" label="ظرفیت کل" description="بیشترین شمار ثبت نهایی این فرم (مثل ظرفیت یک دوره)؛ خالی یعنی بی‌سقف." />
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField control={values.control} name="per_user_limit" label="سقف ثبت هر کاربر" description="مثلاً ۱ یعنی هر کس فقط یک‌بار؛ خالی یعنی بی‌سقف." />
          <FormField
            control={values.control}
            name="per_user_period"
            label="در دوره‌ی"
            layout="stacked"
            render={({ field, id, aria }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ever">در کل</SelectItem>
                  <SelectItem value="day">هر روز</SelectItem>
                  <SelectItem value="month">هر ماه</SelectItem>
                  <SelectItem value="year">هر سال</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <NumberField control={values.control} name="edit_hours" label="ویرایش پس از ثبت (ساعت)" description="ثبت‌کننده تا این چند ساعت پس از ثبت می‌تواند ثبتش را ویرایش کند؛ خالی یعنی ثبت نهایی تغییر نمی‌کند." />
        <FormField
          control={values.control}
          name="allow_drafts"
          label="پیش‌نویس خودکار"
          description="خاموش: فرم یک‌جا ثبت می‌شود و پیش‌نویسی نمی‌ماند (مناسب فرم‌های کوتاه)."
          render={({ field, id }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} className="mt-1.5" />}
        />
        {drafts && <NumberField control={values.control} name="draft_days" label="حذف پیش‌نویس پس از (روز)" description="پیش‌نویسی که این چند روز دست نخورده، با فایل‌هایش حذف می‌شود؛ خالی یعنی می‌ماند." />}
      </SheetPart>

      <SheetPart title="پس از ثبت">
        <FormField
          control={values.control}
          name="after_submit"
          label="پس از ثبت"
          description="«صفحه‌ی تأیید» پیام پس از ثبت را نشان می‌دهد که در طراح (ویژگی‌های فرم) نوشته می‌شود."
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forms">بازگشت به «فرم‌ها»</SelectItem>
                <SelectItem value="page">صفحه‌ی تأیید</SelectItem>
                <SelectItem value="url">رفتن به نشانی</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {afterSubmit === "url" && (
          <FormField control={values.control} name="after_submit_url" label="نشانی پس از ثبت" required render={({ field, id, aria }) => <Input id={id} dir="ltr" className="text-start" placeholder="https://" {...field} {...aria} />} />
        )}
        <FormField
          control={values.control}
          name="notify_submitter"
          label="اعلان تأیید به ثبت‌کننده"
          description="اعلان درون سامانه با شماره‌ی ثبت؛ پیامک یا ایمیل بنا به انتخاب خود کاربر. متنش در «تنظیمات › متن اعلان‌ها» است."
          render={({ field, id }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} className="mt-1.5" />}
        />
        <FormField
          control={values.control}
          name="notify_users"
          label="اطلاع به کاربران"
          description="هر ثبت تازه به این کاربران خبر داده می‌شود (فقط خبر؛ تأیید و ارجاع در فرایندساز)."
          render={({ field, id }) => <UsersInput id={id} value={field.value} onChange={field.onChange} />}
        />
        <FormField
          control={values.control}
          name="notify_roles"
          label="اطلاع به نقش‌ها"
          render={({ field, id, aria }) => <SearchPicker id={id} options={roles} multiple value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="انتخاب نقش‌ها" {...aria} />}
        />
      </SheetPart>

      <SheetPart title="حریم">
        <FormField
          control={values.control}
          name="anonymous"
          label="بی‌نام (نظرسنجی)"
          description="بینندگان ثبت‌ها نام و مشخصات ثبت‌کننده را نمی‌بینند؛ فیلد «ثبت‌کننده» و «امضا» در این فرم نمی‌آید."
          render={({ field, id }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} className="mt-1.5" />}
        />
      </SheetPart>
    </FormSheet>
  )
}

type Values = z.infer<typeof schema>

function SheetPart({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <Separator />
      <div className="flex items-center gap-1">
        <p className="text-xs font-semibold">{title}</p>
        {help && <InfoTip label={`راهنمای ${title}`}>{help}</InfoTip>}
      </div>
      <FieldGroup className="gap-3">{children}</FieldGroup>
    </section>
  )
}

function NumberField({ control, name, label, description }: { control: Control<Values>; name: "capacity" | "per_user_limit" | "edit_hours" | "draft_days"; label: string; description: string }) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      description={description}
      layout="stacked"
      render={({ field, id, aria }) => <Input id={id} inputMode="numeric" dir="ltr" className="text-start tabular-nums" {...field} onChange={(e) => field.onChange(onlyDigits(e.target.value))} {...aria} />}
    />
  )
}

/** تاریخ و ساعت شمسی در دو کادر کنار هم. */
function DateTimeField({ control, date, time, label, description }: { control: Control<Values>; date: "opens_date" | "closes_date"; time: "opens_time" | "closes_time"; label: string; description: string }) {
  return (
    <FormField
      control={control}
      name={date}
      label={label}
      description={description}
      layout="stacked"
      render={({ field, id, aria }) => (
        <div className="flex flex-wrap items-center gap-2">
          <JalaliDateInput id={id} className="w-44" value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />
          <Controller control={control} name={time} render={({ field: t }) => <TimeInput value={t.value} onChange={t.onChange} aria-label={`${label} — ساعت`} />} />
        </div>
      )}
    />
  )
}

/** چند کاربر: افزودن با جست‌وجو و برداشتن از فهرست. */
function UsersInput({ id, value, onChange }: { id: string; value: number[]; onChange: (v: number[]) => void }) {
  const names = useQuery({
    queryKey: ["users", "names", value.join(",")],
    queryFn: () => unwrap(api.GET("/api/auth/user-lookup/", { params: { query: { ids: value.join(",") } } })),
    enabled: value.length > 0,
  }).data
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul aria-label="کاربران انتخاب‌شده" className="flex flex-wrap gap-1.5">
          {value.map((pk) => {
            const name = names?.find((u) => u.id === pk)?.full_name ?? toFaDigits(pk)
            return (
              <li key={pk} className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 ps-2 pe-0.5 text-xs">
                {name}
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`برداشتن ${name}`} onClick={() => onChange(value.filter((x) => x !== pk))}>
                  <X />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <UserPicker id={id} value={null} onChange={(u) => u && !value.includes(u.id) && onChange([...value, u.id])} placeholder="افزودن کاربر" />
    </div>
  )
}
