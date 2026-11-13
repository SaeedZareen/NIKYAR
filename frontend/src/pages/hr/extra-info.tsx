import * as React from "react"
import { Link } from "react-router"
import { useForm, useWatch } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PencilRuler, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/app/auth"
import { ErrorSummary } from "@/components/form/error-summary"
import { applyServerErrors } from "@/components/form/server-errors"
import { fieldLabels, screenKey, toFormValues, toPayload, type FormDefinition, type FormValues } from "@/components/form-renderer/definition"
import { FormRenderer } from "@/components/form-renderer/form-renderer"
import { applyRules } from "@/components/form-renderer/rules"
import { formResolver, type JsonSchema } from "@/components/form-renderer/validate"
import { FormSummary } from "@/components/form-renderer/value-view"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { EMPLOYEES_KEY } from "./employees"

type Employee = Schemas["EmployeeDetail"]
type CustomFields = Schemas["CustomFields"]

/**
 * «اطلاعات تکمیلی»: فیلدهای دلخواهی که سازمان با طراح فرم‌ساز برای پرونده ساخته است؛ نمایش با همان خلاصه‌ی فرم‌ها
 * و ویرایش در همین زبانه با همان نمایشگر و سنجش فرم‌ساز.
 */
export function ExtraInfo({ employee, custom }: { employee: Employee; custom: CustomFields }) {
  const definition = custom.definition as FormDefinition
  const [editing, setEditing] = React.useState(false)
  const hasFields = definition.sections.some((s) => s.fields.length > 0)
  const design = custom.can_design && (
    <Button asChild variant="outline" size="sm">
      <Link to={`/forms/design/${custom.form}`}>
        <PencilRuler /> طراحی فیلدها
      </Link>
    </Button>
  )
  if (!hasFields) {
    return (
      <Section title="اطلاعات تکمیلی" description="فیلدهای دلخواه سازمان برای پرونده (مثل سایز لباس کار یا شماره‌ی کمد)، ساخته‌شده با طراح فرم‌ساز." actions={design}>
        <p className="text-xs text-muted-foreground">
          هنوز فیلد دلخواهی برای پرونده منتشر نشده است.{custom.can_design ? " با «طراحی فیلدها» بسازید و منتشر کنید." : " طراح فرم‌ها می‌تواند آن را بسازد."}
        </p>
      </Section>
    )
  }
  if (editing) return <ExtraForm employee={employee} definition={definition} schema={custom.schema as JsonSchema} onDone={() => setEditing(false)} />
  const rules = applyRules(definition, employee.extra as Record<string, unknown>).state
  return (
    <Section
      title="اطلاعات تکمیلی"
      actions={
        (employee.can_edit || custom.can_design) && (
          <>
            {design}
            {employee.can_edit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil /> ویرایش اطلاعات تکمیلی
              </Button>
            )}
          </>
        )
      }
    >
      <FormSummary definition={definition} data={employee.extra as Record<string, unknown>} rules={rules} title="اطلاعات تکمیلی" />
    </Section>
  )
}

function ExtraForm({ employee, definition, schema, onDone }: { employee: Employee; definition: FormDefinition; schema: JsonSchema; onDone: () => void }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const me = React.useMemo(() => (user ? { id: user.id, unitId: user.assignment?.unit_id, profile: user.profile } : undefined), [user])
  const defaults = React.useMemo(() => toFormValues(definition, employee.extra as Record<string, unknown>, me), [definition, employee.extra, me])
  const form = useForm<FormValues>({ resolver: formResolver(definition, schema), defaultValues: defaults, mode: "onTouched", shouldFocusError: false })
  const values = useWatch({ control: form.control })
  const { state: rules } = React.useMemo(() => applyRules(definition, toPayload(definition, values as FormValues)), [definition, values])
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => unwrap(api.PATCH("/api/hr/employees/{id}/extra/", { params: { path: { id: employee.id } }, body: { data } })),
    onSuccess: (saved) => {
      qc.setQueryData([...EMPLOYEES_KEY, String(employee.id)], saved)
      qc.invalidateQueries({ queryKey: EMPLOYEES_KEY, exact: true })
      toast.success("اطلاعات تکمیلی ذخیره شد.")
      onDone()
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(applyRules(definition, toPayload(definition, v)).values)
    } catch (e) {
      applyServerErrors(form, e, (name) => screenKey(definition, v, name))
    }
  })
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ErrorSummary errors={form.formState.errors} labels={fieldLabels(definition)} submitCount={form.formState.submitCount} />
      <FormRenderer
        definition={definition}
        title="اطلاعات تکمیلی"
        control={form.control}
        rules={rules}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />} ذخیره
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              انصراف
            </Button>
          </div>
        }
      />
    </form>
  )
}
