import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { DELEGATIONS_KEY } from "@/app/delegations"
import { z } from "zod"
import { toast } from "sonner"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { JalaliDateInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { UserPicker } from "@/components/user-picker"
import { Input } from "@/components/ui/input"
import { api, unwrap } from "@/lib/api/client"
import { formatDate, toJalaliString } from "@/lib/format"
import { schemas } from "@/lib/validators"

const picked = z.object({ id: z.number(), name: z.string() }).nullable()

/** جانشین تازه؛ با choosePrincipal (راهبر سامانه) برای هر کاربری، وگرنه برای خود کاربر. */
export function DelegationSheet({ choosePrincipal, open, onOpenChange }: { choosePrincipal?: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const schema = z.object({
    principal: choosePrincipal ? picked.refine((u) => u !== null, "اصیل را انتخاب کنید.") : picked,
    delegate: picked.refine((u) => u !== null, "جانشین را انتخاب کنید."),
    start_date: schemas.jalaliDate.refine((v) => v !== "", "تکمیل «از تاریخ» الزامی است."),
    end_date: schemas.jalaliDate.refine((v) => v !== "", "تکمیل «تا تاریخ» الزامی است."),
    reason: z.string().trim().max(200, "حداکثر ۲۰۰ نویسه."),
  })
  const LABELS = { principal: "اصیل", delegate: "جانشین", start_date: "از تاریخ", end_date: "تا تاریخ", reason: "علت" }
  const [today] = React.useState(() => toJalaliString(new Date()))
  const form = useAppForm(schema, { principal: null, delegate: null, start_date: today, end_date: "", reason: "" })
  const save = useMutation({
    mutationFn: (v: z.output<typeof schema>) =>
      unwrap(
        api.POST("/api/delegations/", {
          body: { principal: v.principal?.id, delegate: v.delegate!.id, start_date: v.start_date, end_date: v.end_date, reason: v.reason },
        })
      ),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: DELEGATIONS_KEY })
      toast.success(`${d.delegate_name} از ${formatDate(d.start_date, "long")} تا ${formatDate(d.end_date, "long")} جانشین ${d.principal_name} شد.`)
      onOpenChange(false)
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
    <FormSheet open={open} onOpenChange={onOpenChange} title="جانشین جدید" description="در این بازه، همه‌ی کارهای اصیل در همه‌ی فرایندها و فرم‌ها به کارتابل جانشین هم می‌رسد." onSubmit={onSubmit} submitting={save.isPending}>
      <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        {choosePrincipal && (
          <FormField
            control={form.control}
            name="principal"
            label={LABELS.principal}
            required
            description="کسی که جانشین برایش تعیین می‌شود."
            render={({ field, id, aria }) => <UserPicker id={id} value={field.value} onChange={field.onChange} {...aria} />}
          />
        )}
        <FormField
          control={form.control}
          name="delegate"
          label={LABELS.delegate}
          required
          render={({ field, id, aria }) => <UserPicker id={id} value={field.value} onChange={field.onChange} {...aria} />}
        />
        <FormField
          control={form.control}
          name="start_date"
          label={LABELS.start_date}
          required
          render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
        />
        <FormField
          control={form.control}
          name="end_date"
          label={LABELS.end_date}
          required
          description="روز پایان هم جزو بازه است."
          render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
        />
        <FormField
          control={form.control}
          name="reason"
          label={LABELS.reason}
          render={({ field, id, aria }) => <Input id={id} maxLength={200} {...field} {...aria} />}
        />
      </FormGrid>
    </FormSheet>
  )
}
