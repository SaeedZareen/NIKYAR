import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { z } from "zod"
import { toast } from "sonner"
import { useLookupItems } from "@/app/lookups"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { DigitsInput, JalaliDateInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { useUnitOptions } from "@/components/form-renderer/org-options"
import { ImageInput } from "@/components/files/image-input"
import { RegionInput } from "@/components/region-input"
import { SearchPicker } from "@/components/search-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserPicker } from "@/components/user-picker"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { schemas } from "@/lib/validators"
import { EMPLOYEES_KEY } from "./employees"

type Employee = Schemas["EmployeeDetail"]

const LABELS = {
  first_name: "نام",
  last_name: "نام خانوادگی",
  father_name: "نام پدر",
  national_code: "کد ملی",
  id_number: "شماره‌ی شناسنامه",
  birth_date: "تاریخ تولد",
  birth_place: "محل تولد",
  gender: "جنسیت",
  marital_status: "وضعیت تأهل",
  mobile: "موبایل",
  email: "ایمیل",
  region: "استان و شهر",
  address: "نشانی",
  photo: "عکس پرسنلی",
  hire_date: "تاریخ استخدام",
  employment_type: "نوع استخدام",
  unit: "واحد",
  user: "کاربر سامانه",
  status: "وضعیت",
  separation_date: "تاریخ پایان همکاری",
  separation_reason: "علت پایان همکاری",
}

const schema = z
  .object({
    first_name: schemas.required(LABELS.first_name),
    last_name: schemas.required(LABELS.last_name),
    father_name: z.string(),
    national_code: schemas.nationalId,
    id_number: z.string(),
    birth_date: schemas.jalaliDate,
    birth_place: z.string(),
    gender: schemas.required(LABELS.gender),
    marital_status: z.string(),
    mobile: z.union([z.literal(""), schemas.mobile]),
    email: z.union([z.literal(""), schemas.email]),
    region: z.object({ province: z.string().optional(), city: z.string().optional() }),
    address: z.string(),
    photo: z.string(),
    hire_date: schemas.required(LABELS.hire_date).pipe(schemas.jalaliDate),
    employment_type: schemas.required(LABELS.employment_type),
    unit: z.string(),
    user: z.object({ id: z.number(), name: z.string() }).nullable(),
    status: z.enum(["active", "separated"]),
    separation_date: schemas.jalaliDate,
    separation_reason: z.string(),
  })
  .refine((v) => v.status !== "separated" || v.separation_date, { path: ["separation_date"], message: "تاریخ پایان همکاری را وارد کنید." })

type Props = { employee: Employee | null; open: boolean; onOpenChange: (open: boolean) => void }

/** پانل پرونده‌ی تازه یا ویرایش پرونده؛ پرونده‌ی تازه پس از ثبت باز می‌شود. */
export function EmployeeSheet({ employee, open, onOpenChange }: Props) {
  const isNew = !employee
  const qc = useQueryClient()
  const navigate = useNavigate()
  const kinds = useLookupItems("employment-type")
  const reasons = useLookupItems("separation-reason")
  const units = useUnitOptions()
  const form = useAppForm(schema, {
    first_name: employee?.first_name ?? "",
    last_name: employee?.last_name ?? "",
    father_name: employee?.father_name ?? "",
    national_code: employee?.national_code ?? "",
    id_number: employee?.id_number ?? "",
    birth_date: employee?.birth_date ?? "",
    birth_place: employee?.birth_place ?? "",
    gender: employee?.gender ?? "",
    marital_status: employee?.marital_status ?? "",
    mobile: employee?.mobile ?? "",
    email: employee?.email ?? "",
    region: { province: employee?.province || undefined, city: employee?.city || undefined },
    address: employee?.address ?? "",
    photo: employee?.photo ?? "",
    hire_date: employee?.hire_date ?? "",
    employment_type: employee ? String(employee.employment_type) : "",
    unit: employee?.unit ? String(employee.unit) : "",
    user: employee?.user ? { id: employee.user, name: employee.user_name } : null,
    status: (employee?.status ?? "active") as "active" | "separated",
    separation_date: employee?.separation_date ?? "",
    separation_reason: employee?.separation_reason ? String(employee.separation_reason) : "",
  })
  const separated = form.watch("status") === "separated"

  const save = useMutation({
    mutationFn: (body: Schemas["PatchedEmployeeDetailRequest"]) =>
      isNew
        ? unwrap(api.POST("/api/hr/employees/", { body: body as Schemas["EmployeeDetailRequest"] }))
        : unwrap(api.PATCH("/api/hr/employees/{id}/", { params: { path: { id: String(employee.id) } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: EMPLOYEES_KEY })
      toast.success(isNew ? `پرونده‌ی «${saved.full_name}» با کد پرسنلی ${saved.personnel_code} ثبت شد.` : `تغییرات پرونده‌ی «${saved.full_name}» ذخیره شد.`)
      onOpenChange(false)
      if (isNew) navigate(`/hr/employees/${saved.id}`)
    },
  })

  const onSubmit = form.handleSubmit(async ({ region, user, unit, employment_type, separation_reason, birth_date, separation_date, gender, marital_status, ...values }) => {
    try {
      await save.mutateAsync({
        ...values,
        gender: gender as Schemas["GenderEnum"],
        marital_status: marital_status as Schemas["PatchedEmployeeDetailRequest"]["marital_status"],
        province: region.province ?? "",
        city: region.city ?? "",
        birth_date: birth_date || null,
        separation_date: separated ? separation_date || null : null,
        separation_reason: separated && separation_reason ? Number(separation_reason) : null,
        employment_type: Number(employment_type),
        unit: unit ? Number(unit) : null,
        user: user?.id ?? null,
      })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  const text = (name: "first_name" | "last_name" | "father_name" | "id_number" | "birth_place" | "address", required = false) => (
    <FormField control={form.control} name={name} label={LABELS[name]} required={required} render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
  )
  const select = (name: "gender" | "marital_status" | "employment_type" | "separation_reason" | "status", options: { value: string; label: string }[], required = false) => (
    <FormField
      control={form.control}
      name={name}
      label={LABELS[name]}
      required={required}
      render={({ field, id, aria }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={id} className="w-full" {...aria}>
            <SelectValue placeholder="انتخاب کنید" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )
  const date = (name: "birth_date" | "hire_date" | "separation_date", required = false) => (
    <FormField
      control={form.control}
      name={name}
      label={LABELS[name]}
      required={required}
      render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
    />
  )
  const heading = (title: string) => <h3 className="col-span-full pt-2 text-xs font-semibold text-muted-foreground">{title}</h3>

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title={isNew ? "پرونده‌ی تازه" : `ویرایش پرونده‌ی ${employee.full_name}`}
      description={isNew ? "کد پرسنلی پس از ثبت خودکار صادر می‌شود." : `کد پرسنلی: ${employee.personnel_code}`}
      onSubmit={onSubmit}
      submitting={save.isPending}
    >
      <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
      <FormGrid columns={2}>
        {heading("مشخصات فردی")}
        {text("first_name", true)}
        {text("last_name", true)}
        <FormField
          control={form.control}
          name="national_code"
          label={LABELS.national_code}
          required
          render={({ field, id, aria }) => <DigitsInput kind="nationalId" id={id} {...field} {...aria} />}
        />
        {text("father_name")}
        {text("id_number")}
        {date("birth_date")}
        {text("birth_place")}
        {select(
          "gender",
          [
            { value: "male", label: "مرد" },
            { value: "female", label: "زن" },
          ],
          true
        )}
        {select("marital_status", [
          { value: "single", label: "مجرد" },
          { value: "married", label: "متأهل" },
        ])}
        <FormField
          control={form.control}
          name="photo"
          label={LABELS.photo}
          className="col-span-full"
          render={({ field, id, aria }) => <ImageInput id={id} value={field.value} onChange={field.onChange} alt="عکس پرسنلی" {...aria} />}
        />
        {heading("تماس و نشانی")}
        <FormField control={form.control} name="mobile" label={LABELS.mobile} render={({ field, id, aria }) => <DigitsInput kind="mobile" id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="email"
          label={LABELS.email}
          render={({ field, id, aria }) => <Input id={id} type="email" dir="ltr" autoComplete="off" {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="region"
          label={LABELS.region}
          className="col-span-full"
          render={({ field, id, aria }) => <RegionInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} label={LABELS.region} {...aria} />}
        />
        <div className="col-span-full">{text("address")}</div>
        {heading("استخدام")}
        {date("hire_date", true)}
        {select(
          "employment_type",
          (kinds.data ?? []).map((k) => ({ value: String(k.id), label: k.title })),
          true
        )}
        <FormField
          control={form.control}
          name="unit"
          label={LABELS.unit}
          description="کارکنان هر واحد را مدیر همان واحد (فقط‌خواندنی) می‌بیند."
          render={({ field, id, aria }) => <SearchPicker id={id} options={units} value={field.value} onChange={(v) => field.onChange(String(v))} onBlur={field.onBlur} placeholder="انتخاب واحد" {...aria} />}
        />
        <FormField
          control={form.control}
          name="user"
          label={LABELS.user}
          description="اگر کارمند حساب کاربری دارد، سمت‌هایش از ساختار سازمانی خوانده می‌شود."
          render={({ field, id, aria }) => <UserPicker id={id} value={field.value} onChange={field.onChange} {...aria} />}
        />
        {select("status", [
          { value: "active", label: "شاغل" },
          { value: "separated", label: "پایان همکاری" },
        ])}
        {separated && date("separation_date", true)}
        {separated &&
          select(
            "separation_reason",
            (reasons.data ?? []).map((r) => ({ value: String(r.id), label: r.title }))
          )}
      </FormGrid>
    </FormSheet>
  )
}
