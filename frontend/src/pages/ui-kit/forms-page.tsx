import { z } from "zod"
import { toast } from "sonner"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { useAppForm } from "@/components/form/use-app-form"
import { DigitsInput, IbanInput, JalaliDateInput, MoneyInput } from "@/components/form/inputs"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/format"
import { schemas } from "@/lib/validators"
import { TYPE_LABELS, UNIT_NAMES } from "./sample-data"

const BANKS = ["ملی", "ملت", "تجارت", "صادرات", "سپه", "پاسارگاد", "سامان", "پارسیان", "رفاه کارگران", "مسکن"]

const schema = z.object({
  firstName: schemas.required("نام"),
  lastName: schemas.required("نام خانوادگی"),
  nationalId: schemas.nationalId,
  mobile: schemas.mobile,
  email: z.union([z.literal(""), schemas.email]),
  birthDate: schemas.jalaliDate.refine((v) => v !== "", "تاریخ تولد را وارد کنید."),
  unit: z.string().min(1, "واحد سازمانی را انتخاب کنید."),
  type: z.enum(["permanent", "contract", "project"], "نوع استخدام را انتخاب کنید."),
  salary: z
    .string()
    .min(1, "حقوق پایه را وارد کنید.")
    .refine((v) => Number(v) >= 1_000_000, "حقوق پایه نمی‌تواند کمتر از ۱٬۰۰۰٬۰۰۰ تومان باشد."),
  bank: z.string().min(1, "بانک را انتخاب کنید."),
  iban: schemas.iban,
  postalCode: z.union([z.literal(""), schemas.postalCode]),
  insured: z.boolean(),
  notes: z.string().max(500, "توضیحات حداکثر ۵۰۰ نویسه است."),
})

type Values = z.input<typeof schema>

const LABELS: Record<keyof Values, string> = {
  firstName: "نام",
  lastName: "نام خانوادگی",
  nationalId: "کد ملی",
  mobile: "موبایل",
  email: "ایمیل",
  birthDate: "تاریخ تولد",
  unit: "واحد سازمانی",
  type: "نوع استخدام",
  salary: "حقوق پایه",
  bank: "بانک",
  iban: "شماره‌ی شبا",
  postalCode: "کد پستی",
  insured: "بیمه",
  notes: "توضیحات",
}

const DEFAULTS: Values = {
  firstName: "",
  lastName: "",
  nationalId: "",
  mobile: "",
  email: "",
  birthDate: "",
  unit: "",
  type: "" as Values["type"],
  salary: "",
  bank: "",
  iban: "",
  postalCode: "",
  insured: true,
  notes: "",
}

export default function FormsPage() {
  const form = useAppForm(schema, DEFAULTS)
  const { control, formState } = form

  const onSubmit = form.handleSubmit(async (values) => {
    await new Promise((r) => setTimeout(r, 600))
    toast.success(`پرونده‌ی «${values.firstName} ${values.lastName}» با حقوق ${formatMoney(Number(values.salary))} ثبت شد.`)
    form.reset(DEFAULTS)
  })

  return (
    <>
      <PageHeader
        title="فرم‌ها"
        description="برچسب کنار فیلد، اعتبارسنجی کد ملی، موبایل، شبا و کد پستی، تاریخ شمسی، مبلغ و خلاصه‌ی خطا پس از ارسال"
        breadcrumbs={[{ label: "کیت رابط کاربری" }]}
      />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={formState.errors} labels={LABELS} submitCount={formState.submitCount} />

        <Section title="مشخصات فردی" description="همان‌طور که در کارت ملی آمده است.">
          <FormGrid>
            <FormField control={control} name="firstName" label="نام" required render={({ field, id, aria }) => <Input id={id} autoComplete="given-name" {...field} {...aria} />} />
            <FormField control={control} name="lastName" label="نام خانوادگی" required render={({ field, id, aria }) => <Input id={id} autoComplete="family-name" {...field} {...aria} />} />
            <FormField control={control} name="nationalId" label="کد ملی" required render={({ field, id, aria }) => <DigitsInput kind="nationalId" id={id} {...field} {...aria} />} />
            <FormField
              control={control}
              name="birthDate"
              label="تاریخ تولد"
              required
              render={({ field, id, aria }) => (
                <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} fromYear={1320} toYear={1390} {...aria} />
              )}
            />
            <FormField control={control} name="mobile" label="موبایل" required render={({ field, id, aria }) => <DigitsInput kind="mobile" id={id} {...field} {...aria} />} />
            <FormField control={control} name="email" label="ایمیل" render={({ field, id, aria }) => <Input id={id} type="email" dir="ltr" autoComplete="email" {...field} {...aria} />} />
            <FormField control={control} name="postalCode" label="کد پستی" render={({ field, id, aria }) => <DigitsInput kind="postalCode" id={id} {...field} {...aria} />} />
          </FormGrid>
        </Section>

        <Section title="اطلاعات استخدامی">
          <FormGrid>
            <FormField
              control={control}
              name="unit"
              label="واحد سازمانی"
              required
              render={({ field, id, aria }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_NAMES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={control}
              name="salary"
              label="حقوق پایه"
              required
              description="مبلغ ماهانه به تومان"
              render={({ field, id, aria }) => <MoneyInput id={id} {...field} {...aria} />}
            />
            <FormField
              control={control}
              name="type"
              label="نوع استخدام"
              required
              group
              render={({ field, id, aria }) => (
                <RadioGroup id={id} tabIndex={-1} value={field.value} onValueChange={field.onChange} className="flex min-h-7 flex-wrap items-center gap-4" {...aria}>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <div key={value} className="flex items-center gap-2">
                      <RadioGroupItem value={value} id={`type-${value}`} />
                      <Label htmlFor={`type-${value}`} className="font-normal">
                        {label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
            <FormField
              control={control}
              name="insured"
              label="بیمه"
              render={({ field, id }) => (
                <div className="flex min-h-7 items-center gap-2">
                  <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
                  <span className="text-xs text-muted-foreground">{field.value ? "مشمول بیمه‌ی تأمین اجتماعی" : "غیرمشمول"}</span>
                </div>
              )}
            />
          </FormGrid>
        </Section>

        <Section
          title="حساب بانکی و توضیحات"
          footer={
            <>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting && <Spinner />}
                {formState.isSubmitting ? "در حال ثبت…" : "ثبت پرونده"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => form.reset(DEFAULTS)}>
                پاک‌کردن فرم
              </Button>
            </>
          }
        >
          <FormGrid>
            <FormField
              control={control}
              name="bank"
              label="بانک"
              required
              description="نام بانک را تایپ کنید تا فهرست محدود شود."
              render={({ field, id, aria }) => (
                <Combobox items={BANKS} value={field.value || null} onValueChange={(v) => field.onChange(v ?? "")}>
                  <ComboboxInput id={id} placeholder="جست‌وجوی بانک" className="w-full" onBlur={field.onBlur} {...aria} />
                  <ComboboxContent>
                    <ComboboxEmpty>بانکی پیدا نشد.</ComboboxEmpty>
                    <ComboboxList>
                      {(item: string) => (
                        <ComboboxItem key={item} value={item}>
                          {item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            />
            <FormField control={control} name="iban" label="شماره‌ی شبا" required render={({ field, id, aria }) => <IbanInput id={id} {...field} {...aria} />} />
            <FormField
              control={control}
              name="notes"
              label="توضیحات"
              className="col-span-full"
              hint={`${(form.watch("notes") ?? "").length.toLocaleString("fa-IR")} از ۵۰۰ نویسه`}
              render={({ field, id, aria }) => <Textarea id={id} rows={3} {...field} {...aria} />}
            />
          </FormGrid>
        </Section>
      </form>
    </>
  )
}
