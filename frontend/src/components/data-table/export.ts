import type { Row, RowData } from "@tanstack/react-table"
import type { DataTableFeatures, DataTableInstance } from "./use-data-table"

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * خروجی CSV با BOM (اکسل فارسی را درست باز می‌کند).
 * ردیف‌های انتخاب‌شده اگر باشند، وگرنه همه‌ی ردیف‌های فیلترشده و مرتب‌شده.
 */
export function exportTableToCsv<TData extends RowData>(table: DataTableInstance<TData>, fileName: string) {
  // فقط ستون‌های داده (ستون‌های نمایشی مثل انتخاب و عملیات مقداری ندارند).
  const columns = table.getVisibleLeafColumns().filter((c) => c.accessorFn)
  const selected = table.getSelectedRowModel().rows
  const rows: Row<DataTableFeatures, TData>[] = selected.length ? selected : table.getPrePaginatedRowModel().rows
  const lines = [
    columns.map((c) => csvCell(c.columnDef.meta?.label ?? c.id)).join(","),
    ...rows.map((row) =>
      columns
        .map((c) => {
          const exportValue = c.columnDef.meta?.exportValue
          return csvCell(exportValue ? exportValue(row.original) : row.getValue(c.id))
        })
        .join(",")
    ),
  ]
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement("a"), { href: url, download: `${fileName}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}
