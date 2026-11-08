import type * as React from "react"
import { FieldGroup } from "@/components/ui/field"
import { cn } from "@/lib/utils"

const COLUMNS = { 1: "", 2: "@2xl:grid-cols-2", 3: "@2xl:grid-cols-2 @6xl:grid-cols-3" } as const

/**
 * چیدمان فیلدهای فرم بر اساس عرض واقعی بخش (نه عرض صفحه):
 * یک ستون در فضای باریک، دو ستون از ۶۷۲px، سه ستون از ۱۱۵۲px. columns بیشینه‌ی ستون‌هاست.
 * فیلدی که باید تمام عرض باشد: className="col-span-full"؛ دو ستون از سه: className="@2xl:col-span-2".
 */
export function FormGrid({ children, className, columns = 3 }: { children: React.ReactNode; className?: string; columns?: 1 | 2 | 3 }) {
  return (
    <div className="@container">
      <FieldGroup className={cn("grid gap-x-8 gap-y-3", COLUMNS[columns], className)}>{children}</FieldGroup>
    </div>
  )
}

