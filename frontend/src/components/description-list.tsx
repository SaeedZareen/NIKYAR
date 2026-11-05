import * as React from "react"
import { cn } from "@/lib/utils"

type DescriptionItem = { label: string; value: React.ReactNode; ltr?: boolean; span?: "full" }

/** نمایش فقط‌خواندنی برچسب/مقدار؛ به‌جای فیلد غیرفعال که با فیلد قابل ویرایش اشتباه گرفته می‌شود. */
export function DescriptionList({ items, className }: { items: DescriptionItem[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-8 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("flex items-baseline gap-3 border-b border-dashed py-2", item.span === "full" && "sm:col-span-2")}
        >
          <dt className="w-32 shrink-0 text-xs text-muted-foreground">{item.label}</dt>
          <dd className={cn("min-w-0 flex-1 text-sm font-medium break-words", item.ltr && "text-end")} dir={item.ltr ? "ltr" : undefined}>
            {item.value ?? <span className="text-muted-foreground">ثبت نشده</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
