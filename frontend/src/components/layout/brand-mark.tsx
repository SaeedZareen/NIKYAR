import { useBranding } from "@/app/branding"
import { cn } from "@/lib/utils"

/** نشان سامانه: لوگوی سازمان (اگر ثبت شده باشد) یا حرف «ن» نیک‌یار، روی زمینه‌ی روشن. */
export function BrandMark({ className }: { className?: string }) {
  const { logoUrl } = useBranding()
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center overflow-hidden rounded-md bg-header-foreground font-bold text-header", className)}>
      {logoUrl ? <img src={logoUrl} alt="" className="size-full object-contain p-0.5" /> : "ن"}
    </span>
  )
}
