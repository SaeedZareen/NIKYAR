import * as React from "react"
import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrHas,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
} from "@tanstack/react-table"
import type { TableView } from "./use-table-view"

/** همه‌ی قابلیت‌های جدول نیک‌یار؛ یک‌بار و در سطح ماژول تعریف می‌شود. */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString, arrHas: filterFn_arrHas },
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnPinningFeature,
})

export type DataTableFeatures = typeof dataTableFeatures
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>

/** سازنده‌ی ستون‌ها با نوع‌دهی کامل: `const col = columnHelper<Employee>()` */
export const columnHelper = <TData extends RowData>() => createColumnHelper<DataTableFeatures, TData>()

export type FilterOption = { value: string; label: string; icon?: React.ComponentType<{ className?: string }> }

declare module "@tanstack/react-table" {
  interface ColumnMeta<TFeatures, TData, TValue> {
    /** نام فارسی ستون برای منوها، کارت موبایل و خروجی. */
    label?: string
    /** ستون اصلی: عنوان کارت موبایل و محل پیوند ردیف. */
    primary?: boolean
    /** فیلتر چندانتخابی در نوار ابزار. */
    filterOptions?: FilterOption[]
    /** ترازبندی (اعداد و مبالغ: end). */
    align?: "start" | "center" | "end"
    /** مقدار ستون در خروجی اکسل؛ پیش‌فرض مقدار خام ستون. */
    exportValue?: (row: TData) => string | number | null | undefined
  }
}

type Options<TData extends RowData> = {
  view: TableView
  columns: DataTableColumn<TData>[]
  data: TData[]
  getRowId: (row: TData) => string
  /** در حالت سمت سرور، تعداد کل ردیف‌ها؛ وجودش یعنی پردازش با سرور است. */
  rowCount?: number
  enableRowSelection?: boolean
}

export function useDataTable<TData extends RowData>({ view, columns, data, getRowId, rowCount, enableRowSelection = false }: Options<TData>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const manual = rowCount !== undefined

  return useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    rowCount,
    manualFiltering: manual,
    manualSorting: manual,
    manualPagination: manual,
    enableRowSelection,
    enableMultiSort: true,
    // صفحه با تغییر جست‌وجو/فیلتر در useTableView صفر می‌شود؛ بازنشانی خودکار جدول نشانی صفحه را پاک می‌کرد.
    autoResetPageIndex: false,
    columnResizeMode: "onChange",
    columnResizeDirection: "rtl",
    globalFilterFn: "includesString",
    defaultColumn: { size: 160, minSize: 64, maxSize: 640, filterFn: "arrHas", sortFn: "alphanumeric" },
    state: { ...view.state, rowSelection },
    ...view.handlers,
    onRowSelectionChange: setRowSelection,
  })
}

export type DataTableInstance<TData extends RowData> = ReturnType<typeof useDataTable<TData>>
