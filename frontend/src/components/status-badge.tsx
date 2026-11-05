import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatusTone = "success" | "warning" | "destructive" | "info" | "neutral"

const TONES: Record<StatusTone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/12 text-info",
  neutral: "bg-muted text-muted-foreground",
}

/** برچسب وضعیت: همیشه متن دارد و نقطه‌ی رنگی فقط کمکی است (رنگ تنها حامل معنا نیست). */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("gap-1.5 border-transparent font-medium", TONES[tone], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  )
}
