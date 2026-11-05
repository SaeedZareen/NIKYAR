import type { RowData } from "@tanstack/react-table"
import { RotateCcw, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DataTableInstance } from "./use-data-table"
import type { Density, TableView } from "./use-table-view"

/** تنظیم نما: ستون‌های نمایان، تراکم ردیف‌ها و بازگشت به پیش‌فرض. */
export function DataTableViewOptions<TData extends RowData>({ table, view }: { table: DataTableInstance<TData>; view: TableView }) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide())
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="تنظیم نمای جدول">
          <Settings2 aria-hidden />
          <span className="hidden lg:inline">نما</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>ستون‌ها</DropdownMenuLabel>
          {columns.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={c.getIsVisible()}
              onCheckedChange={(v) => c.toggleVisibility(!!v)}
              onSelect={(e) => e.preventDefault()}
            >
              {c.columnDef.meta?.label ?? c.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>تراکم ردیف‌ها</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={view.density} onValueChange={(v) => view.setDensity(v as Density)}>
            <DropdownMenuRadioItem value="compact">فشرده</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="comfortable">راحت</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={view.resetPrefs}>
          <RotateCcw /> بازگشت به نمای پیش‌فرض
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
