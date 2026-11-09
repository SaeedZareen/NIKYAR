import type * as React from "react"
import { FieldGroup } from "@/components/ui/field"
import { cn } from "@/lib/utils"

const COLUMNS = { 1: "", 2: "@2xl:grid-cols-2", 3: "@2xl:grid-cols-2 @6xl:grid-cols-3" } as const
// ستون‌های ثابت (فرم‌ساز): از پهنای تبلت به بالا دقیقاً همان تعداد، تا طراح و پر کردن یک چیدمان داشته باشند.
const FIXED = { 1: "", 2: "md:grid-cols-2", 3: "md:grid-cols-3" } as const

/**
 * چیدمان فیلدهای فرم بر اساس عرض واقعی بخش (نه عرض صفحه):
 * یک ستون در فضای باریک، دو ستون از ۶۷۲px، سه ستون از ۱۱۵۲px. columns بیشینه‌ی ستون‌هاست.
 * fixed: تعداد ستون ثابت از پهنای تبلت (۷۶۸px) به بالا، مستقل از پهنای بخش (فرم‌ساز).
 * فیلدی که باید تمام عرض باشد: className="col-span-full"؛ دو ستون از سه: className="@2xl:col-span-2".
 */
export function FormGrid({ children, className, columns = 3, fixed }: { children: React.ReactNode; className?: string; columns?: 1 | 2 | 3; fixed?: boolean }) {
  return (
    <div className="@container">
      <FieldGroup className={cn("grid gap-x-8 gap-y-3", (fixed ? FIXED : COLUMNS)[columns], className)}>{children}</FieldGroup>
    </div>
  )
}

