import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { SESSION_KEY, useAuth } from "@/app/auth"
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
    // قاعده‌ی گذرواژه در تنظیمات است و سرور می‌سنجد
    new_password: schemas.required("گذرواژه‌ی جدید"),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "تکرار گذرواژه با گذرواژه‌ی جدید یکی نیست." })

const LABELS = { current_password: "گذرواژه‌ی فعلی", new_password: "گذرواژه‌ی جدید", confirm: "تکرار گذرواژه‌ی جدید" }
const DEFAULTS = { current_password: "", new_password: "", confirm: "" }

/**
 * «حساب من › گذرواژه» و صفحه‌ی تغییر اجباری گذرواژه (گذرواژه‌ی موقت یا منقضی). پس از تغییر، ورود این کاربر در
 * دستگاه‌های دیگر بسته می‌شود و نشست دوباره خوانده می‌شود (تغییر اجباری برداشته می‌شود).
 */
export function PasswordTab({ title = "تغییر گذرواژه" }: { title?: string }) {
  const { user } = useAuth()
  const qc = useQueryClient()
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
      qc.invalidateQueries({ queryKey: SESSION_KEY })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <SectionForm
      title={title}
      description="گذرواژه‌ای انتخاب کنید که دیگران حدس نزنند (نه نام، تاریخ تولد یا اعداد پشت سر هم). پس از تغییر، ورود شما در دستگاه‌های دیگر بسته می‌شود."
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
          hint={name === "new_password" ? user?.password_policy : undefined}
          render={({ field, id, aria }) => (
            <Input id={id} type="password" dir="ltr" autoComplete={name === "current_password" ? "current-password" : "new-password"} {...field} {...aria} />
          )}
        />
      ))}
    </SectionForm>
  )
}
