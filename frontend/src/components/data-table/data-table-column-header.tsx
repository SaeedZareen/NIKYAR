import * as React from "react"
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
              // عنوان بلند در دو خط شکسته می‌شود تا جدول در عرض صفحه جا شود.
              className={cn(
                "-ms-2 h-auto min-h-7 gap-1 px-2 py-1 text-start font-semibold whitespace-normal",
                column.columnDef.meta?.align === "end" && "ms-auto -me-2"
              )}
              aria-label={`گزینه‌های ستون ${label}`}
            >
              <span>{label}</span>
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
      {column.getCanResize() && <ResizeHandle header={header} label={label} />}
    </>
  )
}


/**
 * دستگیره‌ی تغییر عرض: از عرض واقعی ستون شروع می‌کند (ستون‌ها به اندازه‌ی محتوا هستند).
 * در راست‌به‌چپ دستگیره لبه‌ی چپ ستون است و کشیدن به چپ ستون را پهن‌تر می‌کند. دوبار کلیک: عرض خودکار.
 */
function ResizeHandle<TData extends RowData>({ header, label }: { header: Header<DataTableFeatures, TData, unknown>; label: string }) {
  const { column } = header
  const table = header.getContext().table
  const [active, setActive] = React.useState(false)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const handle = e.currentTarget
    const th = handle.parentElement
    if (!th) return
    e.preventDefault()
    const startX = e.clientX
    const startWidth = th.getBoundingClientRect().width
    const rtl = getComputedStyle(th).direction === "rtl"
    const { minSize = 64, maxSize = 640 } = column.columnDef
    handle.setPointerCapture(e.pointerId)
    setActive(true)
    const move = (ev: PointerEvent) => {
      const delta = rtl ? startX - ev.clientX : ev.clientX - startX
      const width = Math.round(Math.min(maxSize, Math.max(minSize, startWidth + delta)))
      table.setColumnSizing((old) => ({ ...old, [column.id]: width }))
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
      setActive(false)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`تغییر عرض ستون ${label}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() =>
        table.setColumnSizing((old) => {
          const next = { ...old }
          delete next[column.id]
          return next
        })
      }
      className={cn("absolute inset-y-0 end-0 w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40", active && "bg-primary")}
    />
  )
}
