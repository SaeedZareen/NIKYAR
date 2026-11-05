import * as React from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  description?: React.ReactNode
  /** اقدام‌های همین بخش (کنار عنوان). */
  actions?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

/**
 * بخش صفحه (جعبه‌ی گروه): سربرگ یکسان با عنوان h2، توضیح و اقدام‌ها، سپس محتوا و پانویس.
 * همه‌ی صفحه‌ها برای گروه‌بندی محتوا از همین استفاده می‌کنند تا فاصله‌ها و اندازه‌ها یکی باشد.
 */
export function Section({ title, description, actions, footer, className, contentClassName, children }: Props) {
  const id = React.useId()
  return (
    <Card role="region" aria-labelledby={id} className={cn("gap-0 py-0", className)}>
      {/* سربرگ تک‌ردیفه با ارتفاع ثابت: عنوان، توضیح کوتاه کنارش و اقدام‌ها در انتها */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-(--card-spacing) py-2">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
      </div>
      <CardContent className={cn("flex-1 py-(--card-spacing)", contentClassName)}>{children}</CardContent>
      {footer && <CardFooter className="gap-2 border-t py-2.5">{footer}</CardFooter>}
    </Card>
  )
}
