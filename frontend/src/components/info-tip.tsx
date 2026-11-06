import * as React from "react"
import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Props = {
  /** نام دکمه برای صفحه‌خوان، مثل «راهنمای نام کوتاه». */
  label: string
  children: React.ReactNode
  className?: string
}

/**
 * راهنمای جمع‌شده (ⓘ): متن توضیحی که همیشه لازم نیست، کنار برچسب یا عنوان.
 * با ماوس با نگه داشتن نشانگر و روی لمسی/صفحه‌کلید با زدن باز می‌شود (Tooltip معمولی روی موبایل کار نمی‌کند).
 * صفحه‌خوان متن را از طریق aria-describedby خود فیلد یا بخش می‌شنود؛ این دکمه فقط نمایش است.
 */
export function InfoTip({ label, children, className }: Props) {
  const [open, setOpen] = React.useState(false)
  const pointer = React.useRef("")
  const hover = (e: React.PointerEvent, value: boolean) => e.pointerType === "mouse" && setOpen(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onPointerEnter={(e) => hover(e, true)}
          onPointerLeave={(e) => hover(e, false)}
          // با ماوس باز ماندن به نشانگر وابسته است؛ کلیک آن را نمی‌بندد.
          onClick={(e) => pointer.current === "mouse" && open && e.preventDefault()}
          className={cn(
            "inline-grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
            className
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        aria-label={label}
        className="w-auto max-w-72 border-0 bg-foreground ring-0 px-3 py-1.5 text-2xs text-background shadow-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
