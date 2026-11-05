import type { RowData } from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatNumber } from "@/lib/format"
import type { DataTableInstance } from "./use-data-table"
import { PAGE_SIZES } from "./use-table-view"

/** صفحه‌بندی: بازه‌ی نمایش، تعداد در صفحه و پیمایش. در راست‌به‌چپ «بعدی» به چپ اشاره می‌کند. */
export function DataTablePagination<TData extends RowData>({ table }: { table: DataTableInstance<TData> }) {
  const { pageIndex, pageSize } = table.state.pagination
  const total = table.getRowCount()
  const pageCount = Math.max(1, table.getPageCount())
  const from = total === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min(total, (pageIndex + 1) * pageSize)
  const selected = Object.keys(table.state.rowSelection).length

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
      <p aria-live="polite">
        {total === 0
          ? "بدون ردیف"
          : `نمایش ${formatNumber(from)} تا ${formatNumber(to)} از ${formatNumber(total)}`}
        {selected > 0 && ` · ${formatNumber(selected)} ردیف انتخاب‌شده`}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span id="page-size-label">تعداد در صفحه</span>
          <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="w-16" aria-labelledby="page-size-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {formatNumber(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-foreground">
          صفحه‌ی {formatNumber(pageIndex + 1)} از {formatNumber(pageCount)}
        </span>
        <nav className="flex items-center gap-1" aria-label="صفحه‌بندی">
          <Button variant="outline" size="icon" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()} aria-label="صفحه‌ی اول">
            <ChevronsRight />
          </Button>
          <Button variant="outline" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="صفحه‌ی قبل">
            <ChevronRight />
          </Button>
          <Button variant="outline" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="صفحه‌ی بعد">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()} aria-label="صفحه‌ی آخر">
            <ChevronsLeft />
          </Button>
        </nav>
      </div>
    </div>
  )
}
