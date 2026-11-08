import * as React from "react"
import { useNavigate } from "react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { DESIGN_FORMS_KEY, useRoleOptions } from "@/app/forms"
import { useLookupItems } from "@/app/lookups"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { SearchPicker } from "@/components/search-picker"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, unwrap, type Schemas } from "@/lib/api/client"
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
})
const LABELS = {
  title: "عنوان",
  code: "شناسه",
  category: "دسته",
  description: "توضیح",
  is_active: "فعال",
  fill_by_everyone: "همه‌ی کاربران پر کنند",
  fill_roles: "نقش‌های پرکننده",
  view_roles: "نقش‌های بیننده",
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
  })
  const everyone = values.watch("fill_by_everyone")

  const save = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => {
      const body = {
        ...v,
        category: v.category === NO_CATEGORY ? null : Number(v.category),
        fill_roles: v.fill_roles.map(Number),
        view_roles: v.view_roles.map(Number),
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
      applyServerErrors(values, e)
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
      </FieldGroup>
    </FormSheet>
  )
}
