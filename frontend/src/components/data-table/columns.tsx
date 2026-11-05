// ستون‌های عمومی که بیشتر جدول‌ها لازم دارند: انتخاب ردیف و منوی عملیات.
import type * as React from "react"
import type { RowData } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { DataTableColumn } from "./use-data-table"

/** ستون انتخاب با پشتیبانی Shift برای انتخاب بازه‌ای. */
export function selectColumn<TData extends RowData>(): DataTableColumn<TData> {
  return {
    id: "select",
    size: 36,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    enablePinning: false,
    meta: { label: "انتخاب" },
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="انتخاب همه‌ی ردیف‌های این صفحه"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        // چک‌باکس Radix دکمه است؛ مقدار بعدی و کلید Shift را به گرداننده‌ی بازه‌ای می‌دهیم.
        onClick={(e) => row.getToggleSelectedHandler()({ shiftKey: e.shiftKey, target: { checked: !row.getIsSelected() } })}
        aria-label="انتخاب ردیف"
      />
    ),
  }
}

/** ستون منوی عملیات هر ردیف؛ `items` آیتم‌های DropdownMenu را برمی‌گرداند. */
export function actionsColumn<TData extends RowData>(items: (row: TData) => React.ReactNode): DataTableColumn<TData> {
  return {
    id: "actions",
    size: 44,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    meta: { label: "عملیات" },
    header: () => <span className="sr-only">عملیات</span>,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="عملیات ردیف">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {items(row.original)}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  }
}
