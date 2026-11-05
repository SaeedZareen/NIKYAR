import type * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type Item = { key: string; label: string; icon?: React.ReactNode; meta?: React.ReactNode }

type Props = {
  /** نام فهرست برای صفحه‌خوان. */
  label: string
  items: Item[] | undefined
  current: string | undefined
  onSelect: (key: string) => void
}

/** فهرست انتخاب بخش در ستون کناری صفحه‌های دوستونه (فهرست‌های پایه، تنظیمات). */
export function SectionNav({ label, items, current, onSelect }: Props) {
  if (!items) {
    return (
      <div role="status" aria-label="در حال بارگذاری" className="flex flex-col gap-2 p-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    )
  }
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              aria-current={item.key === current ? "true" : undefined}
              onClick={() => onSelect(item.key)}
              className={cn(
                "flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-start text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
                item.key === current && "bg-accent font-semibold text-accent-foreground hover:bg-accent"
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.meta !== undefined && <span className="text-muted-foreground tabular-nums">{item.meta}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
