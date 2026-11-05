import type { Header, RowData } from "@tanstack/react-table"
import { ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, ChevronsUpDown, EyeOff, PinOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { DataTableFeatures } from "./use-data-table"

type Props<TData extends RowData> = { header: Header<DataTableFeatures, TData, unknown>; sortCount: number }

/** عنوان ستون با منوی مرتب‌سازی، سنجاق و پنهان‌کردن؛ و دستگیره‌ی تغییر عرض. */
export function DataTableColumnHeader<TData extends RowData>({ header, sortCount }: Props<TData>) {
  const column = header.column
  const label = column.columnDef.meta?.label ?? (typeof column.columnDef.header === "string" ? column.columnDef.header : column.id)
  const sorted = column.getIsSorted()
  const pinned = column.getIsPinned()
  const hasMenu = column.getCanSort() || column.getCanHide() || column.getCanPin()
  const sortIndex = column.getSortIndex()
  const multiSort = sortCount > 1

  return (
    <>
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn("-ms-2 h-7 gap-1 px-2 font-semibold", column.columnDef.meta?.align === "end" && "ms-auto -me-2")}
              aria-label={`گزینه‌های ستون ${label}`}
            >
              <span className="truncate">{label}</span>
              {sorted === "asc" ? (
                <ArrowUp aria-label="صعودی" />
              ) : sorted === "desc" ? (
                <ArrowDown aria-label="نزولی" />
              ) : column.getCanSort() ? (
                <ChevronsUpDown className="opacity-50" aria-hidden />
              ) : null}
              {sorted && multiSort && <span className="text-muted-foreground">{(sortIndex + 1).toLocaleString("fa-IR")}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {column.getCanSort() && (
              <>
                <DropdownMenuItem onSelect={() => column.toggleSorting(false, multiSort)}>
                  <ArrowUp /> مرتب‌سازی صعودی
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => column.toggleSorting(true, multiSort)}>
                  <ArrowDown /> مرتب‌سازی نزولی
                </DropdownMenuItem>
                {sorted && (
                  <DropdownMenuItem onSelect={() => column.clearSorting()}>
                    <X /> حذف مرتب‌سازی
                  </DropdownMenuItem>
                )}
              </>
            )}
            {column.getCanPin() && (
              <>
                <DropdownMenuSeparator />
                {pinned !== "start" && (
                  <DropdownMenuItem onSelect={() => column.pin("start")}>
                    <ArrowRightToLine /> سنجاق به راست
                  </DropdownMenuItem>
                )}
                {pinned !== "end" && (
                  <DropdownMenuItem onSelect={() => column.pin("end")}>
                    <ArrowLeftToLine /> سنجاق به چپ
                  </DropdownMenuItem>
                )}
                {pinned && (
                  <DropdownMenuItem onSelect={() => column.pin(false)}>
                    <PinOff /> برداشتن سنجاق
                  </DropdownMenuItem>
                )}
              </>
            )}
            {column.getCanHide() && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => column.toggleVisibility(false)}>
                  <EyeOff /> پنهان‌کردن ستون
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="font-semibold">{label}</span>
      )}
      {column.getCanResize() && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`تغییر عرض ستون ${label}`}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onDoubleClick={() => column.resetSize()}
          className={cn(
            "absolute inset-y-0 end-0 w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40",
            column.getIsResizing() && "bg-primary"
          )}
        />
      )}
    </>
  )
}

