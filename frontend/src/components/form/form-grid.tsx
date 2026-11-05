import type * as React from "react"
import { FieldGroup } from "@/components/ui/field"
import { cn } from "@/lib/utils"

/**
 * چیدمان فیلدهای فرم بر اساس عرض واقعی بخش (نه عرض صفحه):
 * یک ستون در فضای باریک، دو ستون از ۶۷۲px، سه ستون از ۱۱۵۲px.
 * فیلدی که باید تمام عرض باشد: className="col-span-full".
 */
export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="@container">
      <FieldGroup className={cn("grid gap-x-8 gap-y-3 @2xl:grid-cols-2 @6xl:grid-cols-3", className)}>{children}</FieldGroup>
    </div>
  )
}
