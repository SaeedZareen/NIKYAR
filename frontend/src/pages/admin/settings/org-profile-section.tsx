import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { BRANDING_KEY } from "@/app/branding"
import { FormField } from "@/components/form/form-field"
import { DigitsInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { onlyDigits } from "@/lib/format"
import { schemas } from "@/lib/validators"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"

type Profile = Schemas["OrgProfileSettings"]
const KEY = ["settings", "org-profile"]

const optional = <T extends z.ZodType<string, string>>(schema: T) => z.union([z.literal(""), schema])
const schema = z.object({
  name: schemas.required("نام کامل سازمان"),
  short_name: z.string().trim().max(40, "نام کوتاه حداکثر ۴۰ نویسه است."),
  national_id: optional(schemas.legalNationalId),
  economic_code: z.string().refine((v) => v === "" || [11, 12].includes(onlyDigits(v).length), "کد اقتصادی ۱۱ یا ۱۲ رقم است."),
  registration_number: z.string(),
  phone: optional(schemas.phone),
  email: optional(schemas.email),
  website: optional(z.url({ protocol: /^https?$/, error: "نشانی وب‌سایت را کامل وارد کنید، مثل https://example.ir" })),
  postal_code: optional(schemas.postalCode),
  address: z.string().trim().max(500, "نشانی حداکثر ۵۰۰ نویسه است."),
})
const LABELS: Record<keyof Profile, string> = {
  name: "نام کامل سازمان",
  short_name: "نام کوتاه",
  national_id: "شناسه‌ی ملی",
  economic_code: "کد اقتصادی",
  registration_number: "شماره‌ی ثبت",
  phone: "تلفن",
  email: "ایمیل",
  website: "وب‌سایت",
  postal_code: "کد پستی",
  address: "نشانی",
}

export function OrgProfileSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/org-profile/")) })
  return <SettingsLoader section={section} query={query}>{(profile) => <OrgProfileForm section={section} profile={profile} />}</SettingsLoader>
}

function OrgProfileForm({ section, profile }: { section: SectionInfo; profile: Profile }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, profile)
  const save = useMutation({
    mutationFn: (body: Schemas["OrgProfileSettingsRequest"]) => unwrap(api.PUT("/api/settings/org-profile/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      qc.invalidateQueries({ queryKey: BRANDING_KEY })
      form.reset(saved)
      toast.success("مشخصات سازمان ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const { control } = form

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <FormField control={control} name="name" label={LABELS.name} required className="col-span-full" render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
      <FormField
        control={control}
        name="short_name"
        label={LABELS.short_name}
        description="در نوار بالای سامانه؛ اگر خالی بماند، نام کامل نمایش داده می‌شود."
        render={({ field, id, aria }) => <Input id={id} maxLength={40} {...field} {...aria} />}
      />
      <FormField
        control={control}
        name="national_id"
        label={LABELS.national_id}
        description="شناسه‌ی ملی ۱۱ رقمی شخص حقوقی."
        render={({ field, id, aria }) => <DigitsInput kind="legalNationalId" id={id} {...field} {...aria} />}
      />
      <FormField control={control} name="economic_code" label={LABELS.economic_code} render={({ field, id, aria }) => <DigitsInput kind="economicCode" id={id} {...field} {...aria} />} />
      <FormField
        control={control}
        name="registration_number"
        label={LABELS.registration_number}
        render={({ field, id, aria }) => <DigitsInput kind="registrationNumber" id={id} {...field} {...aria} />}
      />
      <FormField
        control={control}
        name="phone"
        label={LABELS.phone}
        description="با پیش‌شماره‌ی شهر، مثل ۰۲۱۸۸۰۰۰۰۰۰."
        render={({ field, id, aria }) => <DigitsInput kind="phone" id={id} {...field} {...aria} />}
      />
      <FormField
        control={control}
        name="email"
        label={LABELS.email}
        render={({ field, id, aria }) => <Input id={id} type="email" dir="ltr" autoComplete="email" {...field} {...aria} />}
      />
      <FormField control={control} name="website" label={LABELS.website} render={({ field, id, aria }) => <Input id={id} type="url" dir="ltr" autoComplete="url" {...field} {...aria} />} />
      <FormField control={control} name="postal_code" label={LABELS.postal_code} render={({ field, id, aria }) => <DigitsInput kind="postalCode" id={id} {...field} {...aria} />} />
      <FormField control={control} name="address" label={LABELS.address} className="col-span-full" render={({ field, id, aria }) => <Textarea id={id} rows={2} {...field} {...aria} />} />
    </SettingsForm>
  )
}
