import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-md bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        // نیک‌یار: پر شدن از سمت شروع در راست‌به‌چپ (translate منفی در rtl برعکس می‌شود).
        className="size-full flex-1 translate-x-[calc(-1*var(--progress-rest))] bg-primary transition-all rtl:translate-x-(--progress-rest)"
        style={{ "--progress-rest": `${100 - (value || 0)}%` } as React.CSSProperties}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
