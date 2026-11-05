import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
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

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useAppForm(schema, DEFAULTS)
  const change = useMutation({
    mutationFn: (v: z.output<typeof schema>) =>
      unwrap(api.POST("/api/auth/session/password/", { body: { current_password: v.current_password, new_password: v.new_password } })),
  })
  const close = (o: boolean) => {
    if (!o) form.reset(DEFAULTS)
    onOpenChange(o)
  }
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await change.mutateAsync(v)
      toast.success("گذرواژه تغییر کرد.")
      close(false)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تغییر گذرواژه</DialogTitle>
          <DialogDescription>گذرواژه‌ی جدید دست‌کم ۸ نویسه و غیر از اعداد ساده باشد.</DialogDescription>
        </DialogHeader>
        <form id="change-password" onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
          <FieldGroup className="gap-3">
            {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                label={LABELS[name]}
                layout="stacked"
                render={({ field, id, aria }) => (
                  <Input id={id} type="password" dir="ltr" autoComplete={name === "current_password" ? "current-password" : "new-password"} {...field} {...aria} />
                )}
              />
            ))}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="submit" form="change-password" disabled={change.isPending}>
            {change.isPending && <Spinner />}
            تغییر گذرواژه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
