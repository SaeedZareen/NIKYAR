import { Check } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { toFaDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FormSteps } from "./use-form-steps"

// سربرگ فرم چندمرحله‌ای (منطق مرحله‌ها در use-form-steps.ts).

/** نوار پیشرفت و فهرست مرحله‌ها. */
export function StepHeader({ steps }: { steps: FormSteps }) {
  const { sections, current } = steps
  return (
    <nav aria-label="مراحل فرم" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium" aria-live="polite">
          مرحله‌ی {toFaDigits(current + 1)} از {toFaDigits(sections.length)}
        </span>
        <Progress value={((current + 1) / sections.length) * 100} aria-label="پیشرفت فرم" className="flex-1" />
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1">
        {sections.map((s, i) => (
          <li key={s.id} aria-current={i === current ? "step" : undefined} className={cn("flex items-center gap-1 text-2xs", i === current ? "font-medium text-foreground" : "text-muted-foreground")}>
            <span className={cn("grid size-4 place-items-center rounded-full border text-2xs", i < current && "border-primary bg-primary text-primary-foreground", i === current && "border-primary")}>
              {i < current ? <Check className="size-3" aria-hidden /> : toFaDigits(i + 1)}
            </span>
            {s.title || steps.title}
          </li>
        ))}
      </ol>
    </nav>
  )
}
