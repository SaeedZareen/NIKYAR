import type { RowData } from "@tanstack/react-table"
import { columnHelper, type DataTableColumn } from "@/components/data-table"
import { toFaDigits } from "@/lib/format"
import { isDisplay, type FieldDef, type FormDefinition } from "./definition"
import { fieldText, type Names } from "./value-text"

/**
 * ستون جدول برای هر فیلد مقدارپذیر یک تعریف فرم‌ساز (جدول ثبت‌های فرم، فیلدهای دلخواه پرونده و…): مقدار خوانا، جست‌وجو،
 * فیلتر گزینه‌ها و خروجی اکسل. dataOf داده‌ی فرم هر ردیف را می‌دهد.
 */

/** مقدارهای عددی و تاریخی خام می‌مانند تا درست مرتب شوند و در اکسل عدد باشند. */
const NUMERIC = new Set(["number", "amount", "scale"])
const RAW_TEXT = new Set(["date", "time", "datetime"])

export const fieldColumnId = (field: FieldDef) => `v_${field.id}`

/** فیلدهای ستون‌شدنی: فیلدهای مقدارپذیر سطح بخش (گروه تکرارشونده با شمار ردیف‌ها). */
export function valueFields(definition: FormDefinition): FieldDef[] {
  return definition.sections.flatMap((s) => s.fields).filter((f) => !isDisplay(f))
}

export function fieldColumn<T extends RowData>(field: FieldDef, names: Names, dataOf: (row: T) => Record<string, unknown>): DataTableColumn<T> {
  const col = columnHelper<T>()
  const label = field.label || field.id
  const text = (row: T) => fieldText(field, dataOf(row)[field.id], names)
  if (NUMERIC.has(field.type)) {
    return col.accessor((row) => (typeof dataOf(row)[field.id] === "number" ? (dataOf(row)[field.id] as number) : undefined), {
      id: fieldColumnId(field),
      header: label,
      sortFn: "basic",
      sortUndefined: "last",
      meta: { label, align: "end" },
      cell: (c) => <span className="tabular-nums">{text(c.row.original) || <span className="text-muted-foreground">—</span>}</span>,
    })
  }
  if (RAW_TEXT.has(field.type)) {
    return col.accessor((row) => String(dataOf(row)[field.id] ?? ""), {
      id: fieldColumnId(field),
      header: label,
      meta: { label },
      cell: (c) => (c.getValue() ? <span className="tabular-nums">{toFaDigits(c.getValue())}</span> : <span className="text-muted-foreground">—</span>),
    })
  }
  const options =
    field.type === "choice"
      ? ((field.props?.options ?? []) as { label: string }[]).map((o) => ({ value: o.label, label: o.label }))
      : field.type === "boolean"
        ? [
            { value: "بله", label: "بله" },
            { value: "خیر", label: "خیر" },
          ]
        : undefined
  return col.accessor(text, {
    id: fieldColumnId(field),
    header: label,
    enableSorting: field.type !== "table",
    meta: { label, wrap: true, filterOptions: options },
    cell: (c) => c.getValue() || <span className="text-muted-foreground">—</span>,
  })
}
