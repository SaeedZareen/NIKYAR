import * as React from "react"
import { Link, useNavigate } from "react-router"
import type { Cell, Column, Header, Row, RowData } from "@tanstack/react-table"
import { AlertCircle, Download, Inbox, Search, X } from "lucide-react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatNumber, toEnDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { DataTableColumnHeader } from "./data-table-column-header"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableViewOptions } from "./data-table-view-options"
import { exportTableToCsv } from "./export"
import type { DataTableFeatures, DataTableInstance } from "./use-data-table"
import type { TableView } from "./use-table-view"

type DataTableProps<TData extends RowData> = {
  table: DataTableInstance<TData>
  view: TableView
  /** عنوان جدول برای صفحه‌خوان‌ها. */
  caption: string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  searchPlaceholder?: string
  /** پیوند هر ردیف؛ ستون اصلی پیوند واقعی می‌شود و کلیک روی ردیف هم آن را باز می‌کند. */
  rowHref?: (row: TData) => string
  /** عملیات گروهی روی ردیف‌های انتخاب‌شده. */
  bulkActions?: (rows: TData[], clear: () => void) => React.ReactNode
  /** کنترل‌های اضافه در نوار ابزار. */
  toolbar?: React.ReactNode
  empty?: { title: string; description?: string; action?: React.ReactNode }
  /** نام فایل خروجی؛ نبودنش یعنی دکمه‌ی خروجی نمایش داده نشود. */
  exportFileName?: string
  /** فهرست کوتاه و ثابت (چند ردیف): بدون نوار ابزار و صفحه‌بندی. */
  compact?: boolean
}

const INTERACTIVE = "a, button, input, select, textarea, [role=checkbox], [role=menuitem], [data-slot=dropdown-menu-content]"

export function DataTable<TData extends RowData>(props: DataTableProps<TData>) {
  const { table, view, caption, loading, error, onRetry, rowHref, bulkActions, empty, compact } = props
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const rows = table.getRowModel().rows
  const selectedRows = table.getSelectedRowModel().rows

  const openRow = (row: Row<DataTableFeatures, TData>, e: React.MouseEvent) => {
    if (!rowHref || (e.target as HTMLElement).closest(INTERACTIVE)) return
    const href = rowHref(row.original)
    if (e.ctrlKey || e.metaKey) window.open(href, "_blank")
    else navigate(href)
  }

  let body: React.ReactNode
  if (error) {
    body = (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>دریافت اطلاعات ممکن نشد.</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "اتصال به سرور را بررسی کنید."}</AlertDescription>
        {onRetry && (
          <AlertAction>
            <Button variant="outline" onClick={onRetry}>
              تلاش دوباره
            </Button>
          </AlertAction>
        )}
      </Alert>
    )
  } else if (!loading && rows.length === 0) {
    const filtered = view.isFiltered
    body = (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">{filtered ? <Search /> : <Inbox />}</EmptyMedia>
          <EmptyTitle>{filtered ? "نتیجه‌ای پیدا نشد" : (empty?.title ?? "هنوز موردی ثبت نشده است")}</EmptyTitle>
          <EmptyDescription>{filtered ? "جست‌وجو یا فیلترها را تغییر دهید." : empty?.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {filtered ? (
            <Button variant="outline" onClick={view.resetFilters}>
              پاک‌کردن فیلترها
            </Button>
          ) : (
            empty?.action
          )}
        </EmptyContent>
      </Empty>
    )
  } else if (isMobile) {
    body = <MobileList table={table} rows={rows} loading={loading} rowHref={rowHref} />
  } else {
    body = (
      <GridTable table={table} view={view} caption={caption} rows={rows} loading={loading} rowHref={rowHref} onRowClick={openRow} />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {!compact && <Toolbar {...props} />}
      {selectedRows.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent px-2 py-1.5 text-xs" role="region" aria-label="عملیات گروهی">
          <span className="font-medium text-accent-foreground">{formatNumber(selectedRows.length)} ردیف انتخاب‌شده</span>
          {bulkActions(
            selectedRows.map((r) => r.original),
            () => table.resetRowSelection(true)
          )}
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => table.resetRowSelection(true)}>
            <X /> لغو انتخاب
          </Button>
        </div>
      )}
      {body}
      {!compact && !error && rows.length > 0 && <DataTablePagination table={table} />}
    </div>
  )
}

function Toolbar<TData extends RowData>({ table, view, searchPlaceholder, toolbar, exportFileName }: DataTableProps<TData>) {
  const filterColumns = table.getAllLeafColumns().filter((c) => c.columnDef.meta?.filterOptions)
  const manual = table.options.manualFiltering
  // جست‌وجو با تأخیر کوتاه به نشانی صفحه منتقل می‌شود تا هر حرف یک درخواست نسازد.
  const [search, setSearch] = React.useState(view.state.globalFilter)
  // اگر جست‌وجو از بیرون عوض شد (پاک‌کردن فیلترها، دکمه‌ی بازگشت)، کادر هم همگام می‌شود.
  const [urlSearch, setUrlSearch] = React.useState(view.state.globalFilter)
  if (urlSearch !== view.state.globalFilter) {
    setUrlSearch(view.state.globalFilter)
    setSearch(view.state.globalFilter)
  }
  React.useEffect(() => {
    if (toEnDigits(search) === view.state.globalFilter) return
    const t = setTimeout(() => table.setGlobalFilter(toEnDigits(search)), 300)
    return () => clearTimeout(t)
  }, [search, view.state.globalFilter, table])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="w-full sm:w-64">
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder ?? "جست‌وجو…"}
          aria-label={searchPlaceholder ?? "جست‌وجو در جدول"}
        />
      </InputGroup>
      {filterColumns.map((c) => (
        <DataTableFacetedFilter
          key={c.id}
          column={c}
          title={c.columnDef.meta?.label ?? c.id}
          options={c.columnDef.meta!.filterOptions!}
          showCounts={!manual}
        />
      ))}
      {view.isFiltered && (
        <Button variant="ghost" onClick={view.resetFilters}>
          <X /> پاک‌کردن فیلترها
        </Button>
      )}
      {toolbar}
      <div className="ms-auto flex items-center gap-2">
        {exportFileName && (
          <Button variant="outline" onClick={() => exportTableToCsv(table, exportFileName)}>
            <Download aria-hidden />
            <span className="hidden lg:inline">خروجی اکسل</span>
            <span className="sr-only lg:hidden">خروجی اکسل</span>
          </Button>
        )}
        <DataTableViewOptions table={table} view={view} />
      </div>
    </div>
  )
}

/**
 * عرض ستون: ستون‌های کوتاه به اندازه‌ی محتوا (width: 1%) و ستون‌های متنی (meta.wrap) بقیه‌ی عرض را می‌گیرند،
 * تا جدول بدون نوار پیمایش در عرض صفحه جا شود.
 * عرض ثابت فقط برای ستون‌های بدون تغییر عرض (انتخاب، عملیات)، ستون‌های سنجاق‌شده
 * (تا جای ستون‌های چسبان دقیق محاسبه شود) و ستون‌هایی که کاربر عرضشان را تغییر داده است.
 */
function columnStyle<TData extends RowData>(column: Column<DataTableFeatures, TData, unknown>, resized: boolean): React.CSSProperties {
  const pinned = column.getIsPinned()
  const fixed = resized || pinned || !column.getCanResize()
  const width = fixed ? column.getSize() : column.columnDef.meta?.wrap ? undefined : "1%"
  return {
    width,
    minWidth: fixed ? width : undefined,
    maxWidth: fixed ? width : undefined,
    position: pinned ? "sticky" : undefined,
    insetInlineStart: pinned === "start" ? column.getStart("start") : undefined,
    insetInlineEnd: pinned === "end" ? column.getAfter("end") : undefined,
    zIndex: pinned ? 1 : undefined,
  }
}

const alignClass = { start: "text-start", center: "text-center", end: "text-end" } as const

type GridProps<TData extends RowData> = {
  table: DataTableInstance<TData>
  view: TableView
  caption: string
  rows: Row<DataTableFeatures, TData>[]
  loading?: boolean
  rowHref?: (row: TData) => string
  onRowClick: (row: Row<DataTableFeatures, TData>, e: React.MouseEvent) => void
}

function GridTable<TData extends RowData>({ table, view, caption, rows, loading, rowHref, onRowClick }: GridProps<TData>) {
  const compact = view.density === "compact"
  const headers = table.getHeaderGroups()[0].headers as Header<DataTableFeatures, TData, unknown>[]
  const skeletonRows = Math.min(table.state.pagination.pageSize, 8)
  const sizing = table.state.columnSizing

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="w-full">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            {headers.map((h) => (
              <TableHead
                key={h.id}
                style={columnStyle(h.column, h.column.id in sizing)}
                aria-sort={h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : undefined}
                className={cn(
                  "relative h-9 border-e bg-muted last:border-e-0",
                  alignClass[h.column.columnDef.meta?.align ?? "start"]
                )}
              >
                {/* ستون‌های نمایشی (انتخاب، عملیات، دکمه‌ها) سرستون خودشان را دارند؛ ستون‌های داده منوی مرتب‌سازی و سنجاق. */}
                {h.isPlaceholder ? null : !h.column.accessorFn ? (
                  <table.FlexRender header={h} />
                ) : (
                  <DataTableColumnHeader header={h} sortCount={table.state.sorting.length} />
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <TableRow key={i}>
                  {headers.map((h) => (
                    <TableCell key={h.id} className={compact ? "py-1.5" : "py-3"}>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={(e) => onRowClick(row, e)}
                  className={cn("group even:bg-muted/40", rowHref && "cursor-pointer", loading && "opacity-60")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={columnStyle(cell.column, cell.column.id in sizing)}
                      className={cn(
                        "border-e last:border-e-0",
                        cell.column.columnDef.meta?.wrap ? "break-words whitespace-normal" : "whitespace-nowrap",
                        compact ? "py-1" : "py-2.5",
                        cell.column.getIsPinned() && "bg-card group-hover:bg-muted group-data-[state=selected]:bg-muted",
                        alignClass[cell.column.columnDef.meta?.align ?? "start"]
                      )}
                    >
                      <CellContent table={table} cell={cell} href={rowHref?.(row.original)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CellContent<TData extends RowData>({ table, cell, href }: { table: DataTableInstance<TData>; cell: Cell<DataTableFeatures, TData, unknown>; href?: string }) {
  const content = <table.FlexRender cell={cell} />
  if (href && cell.column.columnDef.meta?.primary) {
    return (
      <Link to={href} className="font-medium text-primary hover:underline">
        {content}
      </Link>
    )
  }
  return content
}

/** نمای موبایل: هر ردیف یک کارت؛ ستون اصلی عنوان و بقیه برچسب/مقدار. */
function MobileList<TData extends RowData>({ table, rows, loading, rowHref }: { table: DataTableInstance<TData>; rows: Row<DataTableFeatures, TData>[]; loading?: boolean; rowHref?: (row: TData) => string }) {
  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="فهرست ردیف‌ها">
      {rows.map((row) => {
        const cells = row.getVisibleCells()
        const primary = cells.find((c) => c.column.columnDef.meta?.primary)
        const actions = cells.find((c) => c.column.id === "actions")
        const fields = cells.filter((c) => c !== primary && c !== actions && c.column.id !== "select")
        return (
          <li key={row.id} className="rounded-lg border bg-card p-3 data-[state=selected]:border-primary" data-state={row.getIsSelected() ? "selected" : undefined}>
            <div className="flex items-center gap-2">
              {row.getCanSelect() && table.options.enableRowSelection && (
                <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="انتخاب ردیف" />
              )}
              <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                {primary && <CellContent table={table} cell={primary} href={rowHref?.(row.original)} />}
              </div>
              {actions && <table.FlexRender cell={actions} />}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {fields.map((c) => (
                <React.Fragment key={c.id}>
                  <dt className="text-muted-foreground">{c.column.columnDef.meta?.label ?? c.column.id}</dt>
                  <dd className="min-w-0 truncate">
                    <table.FlexRender cell={c} />
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
