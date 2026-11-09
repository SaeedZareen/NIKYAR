import * as React from "react"
import { Monitor, RefreshCw, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * پیش‌نمایش در اندازه‌ی رایانه یا موبایل: صفحه‌ی پیش‌نمایش (preview-page) در قابی به پهنای همان دستگاه،
 * پس چیدمان ستون‌ها دقیقاً همان است که پرکننده می‌بیند.
 */
export function PreviewDialog({ versionId, title, onOpenChange }: { versionId: number; title: string; onOpenChange: (open: boolean) => void }) {
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop")
  const [reload, setReload] = React.useState(0)
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] max-w-[min(96vw,80rem)] flex-col gap-3 sm:max-w-[min(96vw,80rem)]">
        <DialogHeader className="flex-row flex-wrap items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <DialogTitle>پیش‌نمایش «{title}»</DialogTitle>
            <DialogDescription>فرم را پر کنید تا قاعده‌ها و خطاها را ببینید؛ چیزی ذخیره نمی‌شود.</DialogDescription>
          </div>
          <div role="group" aria-label="اندازه‌ی پیش‌نمایش" className="ms-auto flex items-center gap-0.5 rounded-md border p-0.5">
            {(
              [
                ["desktop", "رایانه", Monitor],
                ["mobile", "موبایل", Smartphone],
              ] as const
            ).map(([key, label, Icon]) => (
              <Button key={key} type="button" size="sm" variant={device === key ? "secondary" : "ghost"} aria-pressed={device === key} onClick={() => setDevice(key)}>
                <Icon /> {label}
              </Button>
            ))}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setReload((n) => n + 1)}>
            <RefreshCw /> از نو
          </Button>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto rounded-md border bg-muted/40 p-2">
          <iframe
            key={reload}
            title={`پیش‌نمایش «${title}» در اندازه‌ی ${device === "mobile" ? "موبایل" : "رایانه"}`}
            src={`/forms/preview/${versionId}`}
            className={cn("h-full rounded-md border bg-background", device === "mobile" ? "w-[390px] shrink-0" : "w-full")}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
