import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, RotateCcw } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { TokenInput } from "@/components/form/token-input"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { schemas } from "@/lib/validators"
import type { SectionInfo } from "./settings-form"

type Kind = Schemas["Kind"]
const KEY = ["notification-kinds"]
const EMPTY: Kind[] = []
const col = columnHelper<Kind>()

/** پیش‌نمایش با مقدارهای نمونه؛ جای‌گذار ناشناخته همان‌طور می‌ماند (مانند سرور). */
function preview(template: string, kind: Kind) {
  const samples = Object.fromEntries(kind.placeholders.map((p) => [p.name, p.sample]))
  return template.replace(/\{(\w+)\}/g, (m, name: string) => samples[name] ?? m)
}

/** «تنظیمات › متن اعلان‌ها»: متن هر نوع اعلان با جای‌گذارها و پیش‌نمایش. */
export function NotificationTemplatesSection({ section }: { section: SectionInfo }) {
  const kinds = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/notifications/kinds/")) })
  const [editing, setEditing] = React.useState<Kind | null>(null)
  const columns = React.useMemo<DataTableColumn<Kind>[]>(
    () => [
      col.accessor("title", { header: "نوع اعلان", meta: { label: "نوع اعلان", primary: true } }),
      col.accessor("preview", { header: "نمونه‌ی متن", enableSorting: false, meta: { label: "نمونه‌ی متن", wrap: true } }),
      col.accessor((k) => (k.is_custom ? "سفارشی" : "پیش‌فرض"), {
        id: "is_custom",
        header: "متن",
        enableSorting: false,
        meta: { label: "متن" },
        cell: (c) => <StatusBadge tone={c.row.original.is_custom ? "info" : "neutral"}>{c.getValue()}</StatusBadge>,
      }),
      actionsColumn<Kind>((k) => (
        <DropdownMenuItem onSelect={() => setEditing(k)}>
          <Pencil /> ویرایش متن
        </DropdownMenuItem>
      )),
    ],
    [setEditing]
  )
  const view = useTableView("notification-kinds", { urlKey: "k.", defaultSort: "title" })
  const table = useDataTable({ view, columns, data: kinds.data ?? EMPTY, getRowId: (k) => k.code })

  return (
    <Section title={section.title} description={section.description}>
      <DataTable
        table={table}
        view={view}
        caption="متن اعلان‌ها"
        loading={kinds.isPending}
        error={kinds.error}
        onRetry={() => kinds.refetch()}
        searchPlaceholder="نوع اعلان"
        empty={{ title: "نوع اعلانی تعریف نشده است" }}
      />
      {editing && <TemplateSheet key={editing.code} kind={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </Section>
  )
}

const schema = z.object({ template: schemas.required("متن اعلان").pipe(z.string().max(500, "متن حداکثر ۵۰۰ نویسه است.")) })

function TemplateSheet({ kind, ...sheet }: { kind: Kind; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, { template: kind.template })
  const template = form.watch("template")
  const save = useMutation({
    mutationFn: (body: Schemas["PatchedKindRequest"]) => unwrap(api.PATCH("/api/notifications/kinds/{code}/", { params: { path: { code: kind.code } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success(`متن اعلان «${saved.title}» ذخیره شد.`)
      sheet.onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const tokens = kind.placeholders.map((p) => ({ token: `{${p.name}}`, label: p.label }))

  return (
    <FormSheet
      {...sheet}
      title={`متن اعلان «${kind.title}»`}
      onSubmit={onSubmit}
      submitting={save.isPending}
      secondaryAction={
        template !== kind.default_template && (
          <Button type="button" variant="ghost" onClick={() => form.setValue("template", kind.default_template, { shouldDirty: true })}>
            <RotateCcw /> متن پیش‌فرض
          </Button>
        )
      }
    >
      <ErrorSummary errors={form.formState.errors} labels={{ template: "متن اعلان" }} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField
          control={form.control}
          name="template"
          label="متن اعلان"
          required
          className="col-span-full"
          description="دکمه‌های زیر فیلد، جای‌گذار را در جای مکان‌نما می‌گذارند؛ هنگام ساخت اعلان، مقدار واقعی جای آن می‌نشیند."
          hint={
            <span aria-live="polite">
              نمونه: <span className="text-foreground">{preview(template, kind)}</span>
            </span>
          }
          render={({ field, id, aria }) => (
            <TokenInput
              id={id}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              tokens={tokens}
              tokensLabel="افزودن جای‌گذار"
              multiline
              maxLength={500}
              {...aria}
            />
          )}
        />
      </FormGrid>
    </FormSheet>
  )
}
