import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { SectionForm } from "@/components/form/section-form"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Input } from "@/components/ui/input"
import { api, unwrap } from "@/lib/api/client"
import { schemas } from "@/lib/validators"

const schema = z
  .object({
    current_password: schemas.required("گذرواژه‌ی فعلی"),
    new_password: z.string().min(8, "گذرواژه‌ی جدید دست‌کم ۸ نویسه باشد."),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "تکرار گذرواژه با گذرواژه‌ی جدید یکی نیست." })

const LABELS = { current_password: "گذرواژه‌ی فعلی", new_password: "گذرواژه‌ی جدید", confirm: "تکرار گذرواژه‌ی جدید" }
const DEFAULTS = { current_password: "", new_password: "", confirm: "" }

/** «حساب من › گذرواژه». پس از تغییر، نشست‌های دیگر این کاربر (دستگاه‌های دیگر) از کار می‌افتند. */
export function PasswordTab() {
  const form = useAppForm(schema, DEFAULTS)
  const change = useMutation({
    mutationFn: (v: z.output<typeof schema>) =>
      unwrap(api.POST("/api/auth/session/password/", { body: { current_password: v.current_password, new_password: v.new_password } })),
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await change.mutateAsync(v)
      form.reset(DEFAULTS)
      toast.success("گذرواژه تغییر کرد.")
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <SectionForm
      title="تغییر گذرواژه"
      description="گذرواژه‌ی جدید دست‌کم ۸ نویسه و غیر از اعداد ساده باشد. پس از تغییر، ورود شما در دستگاه‌های دیگر باطل می‌شود."
      form={form}
      labels={LABELS}
      onSubmit={onSubmit}
      saving={change.isPending}
    >
      {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((name) => (
        <FormField
          key={name}
          control={form.control}
          name={name}
          label={LABELS[name]}
          required
          className={name === "current_password" ? "col-span-full" : undefined}
          render={({ field, id, aria }) => (
            <Input id={id} type="password" dir="ltr" autoComplete={name === "current_password" ? "current-password" : "new-password"} {...field} {...aria} />
          )}
        />
      ))}
    </SectionForm>
  )
}
