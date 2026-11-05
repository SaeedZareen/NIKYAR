import * as React from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** ارسال فرم؛ دکمه‌ی اصلی پانل آن را صدا می‌زند. */
  onSubmit: (e: React.FormEvent) => void
  submitting: boolean
  submitLabel?: string
  /** پهنای پانل: عادی برای فرم‌های کوتاه، پهن برای فرم‌های چندستونه. */
  size?: "default" | "wide"
  children: React.ReactNode
}

/**
 * پانل کناری ویرایش (از سمت چپ، روبه‌روی منو): سربرگ، بدنه‌ی پیمایش‌پذیر و دکمه‌های ثابت پایین.
 * فرم‌های ایجاد و ویرایش همه‌ی بخش‌ها از همین استفاده می‌کنند.
 */
export function FormSheet({ open, onOpenChange, title, description, onSubmit, submitting, submitLabel = "ذخیره", size = "default", children }: Props) {
  const id = React.useId()
  return (
    <Sheet open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      {/* پهنا با همان پیشوند data-[side=left] پیش‌فرض شادسی‌اِن، تا بر آن غلبه کند. */}
      <SheetContent
        side="left"
        className={cn("gap-0 p-0 data-[side=left]:w-full", size === "wide" ? "data-[side=left]:sm:max-w-2xl" : "data-[side=left]:sm:max-w-md")}
      >
        <SheetHeader className="border-b bg-muted/50 py-3">
          <SheetTitle className="text-sm">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <form id={id} onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {children}
        </form>
        <SheetFooter className="flex-row gap-2 border-t py-3">
          <Button type="submit" form={id} disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? "در حال ذخیره…" : submitLabel}
          </Button>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
