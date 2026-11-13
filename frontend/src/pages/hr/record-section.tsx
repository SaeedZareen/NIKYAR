import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { RowData } from "@tanstack/react-table"
import type { DefaultValues, FieldValues, UseFormReturn } from "react-hook-form"
import type { z } from "zod"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { EMPLOYEES_KEY } from "./employees"

/** نوع‌های سوابق پرونده = مسیرهای `/api/hr/<kind>/`. */
export type RecordKind = "educations" | "work-history" | "dependents" | "bank-accounts" | "insurances" | "documents"
type WithId = RowData & { id: number }

/**
 * تعریف یک زبانه‌ی سوابق: ستون‌های جدول و فرم پانل افزودن/ویرایش. `toBody` مقدار فرم را به بدنه‌ی API می‌برد
 * (پرونده را خود بخش می‌افزاید). همه‌ی سوابق پرونده با همین یک بخش ساخته می‌شوند.
 */
export type RecordConfig<T extends WithId, In extends FieldValues, Out extends FieldValues> = {
  kind: RecordKind
  title: string
  description?: string
  /** نام یک مورد در دکمه‌ها و پیام‌ها، مثل «سابقه‌ی تحصیلی». */
  noun: string
  empty: string
  columns: DataTableColumn<T>[]
  schema: z.ZodType<Out, In>
  defaults: (row: T | null) => DefaultValues<In>
  fields: (form: UseFormReturn<In, unknown, Out>) => React.ReactNode
  toBody: (values: Out) => Record<string, unknown>
  labels: Record<string, string>
}

// همه‌ی مسیرهای سوابق یک شکل دارند (فهرست با ?employee=، ساخت، ویرایش، حذف)؛ نوع خروجی را تعریف هر زبانه می‌دهد.
const path = (kind: RecordKind) => `/api/hr/${kind}/` as "/api/hr/educations/"
const item = (kind: RecordKind) => `/api/hr/${kind}/{id}/` as "/api/hr/educations/{id}/"

export function RecordSection<T extends WithId, In extends FieldValues, Out extends FieldValues>({
  config,
  employee,
}: {
  config: RecordConfig<T, In, Out>
  employee: Schemas["EmployeeDetail"]
}) {
  const qc = useQueryClient()
  const key = [...EMPLOYEES_KEY, String(employee.id), config.kind]
  const rows = useQuery({
    queryKey: key,
    queryFn: async () => (await unwrap(api.GET(path(config.kind), { params: { query: { employee: employee.id } } }))) as unknown as T[],
  })
  const [editing, setEditing] = React.useState<{ row: T | null } | null>(null)
  const [deleting, setDeleting] = React.useState<T | null>(null)
  const remove = useMutation({
    mutationFn: (row: T) => unwrap(api.DELETE(item(config.kind), { params: { path: { id: row.id } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      toast.success(`${config.noun} حذف شد.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns = React.useMemo<DataTableColumn<T>[]>(
    () => [
      ...config.columns,
      ...(employee.can_edit
        ? [
            actionsColumn<T>((row) => (
              <>
                <DropdownMenuItem onSelect={() => setEditing({ row })}>
                  <Pencil /> ویرایش
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(row)}>
                  <Trash2 /> حذف
                </DropdownMenuItem>
              </>
            )),
          ]
        : []),
    ],
    [config.columns, employee.can_edit]
  )
  const view = useTableView(`hr-${config.kind}`)
  const table = useDataTable({ view, columns, data: rows.data ?? [], getRowId: (r) => String(r.id) })

  return (
    <Section
      title={config.title}
      description={config.description}
      actions={
        employee.can_edit && (
          <Button variant="outline" size="sm" onClick={() => setEditing({ row: null })}>
            <Plus /> افزودن {config.noun}
          </Button>
        )
      }
    >
      <DataTable table={table} view={view} caption={config.title} compact loading={rows.isPending} error={rows.error} onRetry={() => rows.refetch()} empty={{ title: config.empty }} />
      {editing && <RecordSheet config={config} employee={employee} row={editing.row} onClose={() => setEditing(null)} queryKey={key} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`${config.noun} حذف شود؟`}
          description="این سابقه از پرونده حذف می‌شود؛ تغییر در سوابق تغییرات ثبت می‌ماند."
          confirmLabel="حذف"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </Section>
  )
}

function RecordSheet<T extends WithId, In extends FieldValues, Out extends FieldValues>({
  config,
  employee,
  row,
  onClose,
  queryKey,
}: {
  config: RecordConfig<T, In, Out>
  employee: Schemas["EmployeeDetail"]
  row: T | null
  onClose: () => void
  queryKey: string[]
}) {
  const qc = useQueryClient()
  const form = useAppForm(config.schema, config.defaults(row))
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      row
        ? unwrap(api.PATCH(item(config.kind), { params: { path: { id: row.id } }, body: body as never }))
        : unwrap(api.POST(path(config.kind), { body: { ...body, employee: employee.id } as never })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      toast.success(row ? `${config.noun} ویرایش شد.` : `${config.noun} افزوده شد.`)
      onClose()
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(config.toBody(values))
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? `ویرایش ${config.noun}` : `افزودن ${config.noun}`}
      description={employee.full_name}
      onSubmit={onSubmit}
      submitting={save.isPending}
    >
      <ErrorSummary errors={form.formState.errors} labels={config.labels} submitCount={form.formState.submitCount} />
      <FormGrid columns={1}>{config.fields(form)}</FormGrid>
    </FormSheet>
  )
}
