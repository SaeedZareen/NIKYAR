import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { SESSION_KEY, type Me } from "@/app/auth"
import { DescriptionList } from "@/components/description-list"
import { ImageInput } from "@/components/files"
import { FormField } from "@/components/form/form-field"
import { DigitsInput } from "@/components/form/inputs"
import { SectionForm } from "@/components/form/section-form"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { Input } from "@/components/ui/input"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { schemas } from "@/lib/validators"

const schema = z.object({
  email: z.union([z.literal(""), schemas.email]),
  mobile: z.union([z.literal(""), schemas.mobile]),
  signature: z.string(),
})
const LABELS = { email: "ایمیل", mobile: "موبایل", signature: "تصویر امضا" }
const toForm = (me: Me) => ({ email: me.email, mobile: me.mobile, signature: me.signature })

/** «حساب من › مشخصات»: نام و سمت (فقط‌خواندنی، به دست راهبر سامانه) و آنچه خود کاربر تغییر می‌دهد. */
export function ProfileTab({ me }: { me: Me }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(me))
  const save = useMutation({
    mutationFn: (body: Schemas["PatchedProfileRequest"]) => unwrap(api.PATCH("/api/auth/session/profile/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(SESSION_KEY, saved)
      form.reset(toForm(saved))
      toast.success("مشخصات شما ذخیره شد.")
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
    <div className="flex flex-col gap-4">
      <Section title="اطلاعات حساب" description="نام، نام کاربری و سمت را راهبر سامانه تعیین می‌کند.">
        <DescriptionList
          items={[
            { label: "نام و نام خانوادگی", value: me.full_name || null },
            { label: "نام کاربری", value: me.username, ltr: true },
            { label: "سمت", value: me.positions.length ? me.positions.join("، ") : null, span: "full" },
          ]}
        />
      </Section>
      <SectionForm
        title="راه‌های ارتباط و امضا"
        description="اعلان‌های پیامکی و ایمیلی به همین شماره و نشانی فرستاده می‌شوند."
        form={form}
        labels={LABELS}
        onSubmit={onSubmit}
        saving={save.isPending}
      >
        <FormField
          control={form.control}
          name="mobile"
          label={LABELS.mobile}
          render={({ field, id, aria }) => <DigitsInput kind="mobile" id={id} {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="email"
          label={LABELS.email}
          render={({ field, id, aria }) => <Input id={id} type="email" dir="ltr" autoComplete="email" {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="signature"
          label={LABELS.signature}
          className="col-span-full"
          description="تصویر امضای شما برای چاپ فرم‌ها و نامه‌ها. امضا را روی کاغذ سفید بزنید و عکس یا اسکن آن را بارگذاری کنید (PNG با زمینه‌ی شفاف بهترین است)."
          render={({ field, id, aria }) => <ImageInput id={id} value={field.value} onChange={field.onChange} alt="تصویر امضای شما" {...aria} />}
        />
      </SectionForm>
    </div>
  )
}
