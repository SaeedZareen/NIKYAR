// فرم چندمرحله‌ای (3.7): هر بخش دیدنی یک مرحله؛ پیش از رفتن به مرحله‌ی بعد، فیلدهای همان مرحله سنجیده می‌شوند.
import * as React from "react"
import type { FieldErrors, UseFormReturn } from "react-hook-form"
import { isDisplay, type FormDefinition, type FormValues, type SectionDef } from "./definition"
import type { RuleState } from "./rules"

const valueNames = (section: SectionDef) => section.fields.filter((f) => !isDisplay(f)).map((f) => f.id)

export type FormSteps = ReturnType<typeof useFormSteps>

export function useFormSteps(definition: FormDefinition, rules: RuleState, form: UseFormReturn<FormValues>, title: string) {
  const enabled = definition.steps === true
  const sections = definition.sections.filter((s) => !rules.hiddenSections.has(s.id))
  const [index, setIndex] = React.useState(0)
  const current = Math.min(index, Math.max(sections.length - 1, 0))
  // پس از بررسی ناموفق مرحله، خطاها هم‌زمان با نوشتن به‌روز می‌شوند (نه با ترک فیلد، که دکمه را جابه‌جا می‌کرد)
  const [failed, setFailed] = React.useState<string[] | null>(null)
  const { subscribe, trigger } = form
  React.useEffect(() => {
    if (!failed) return
    return subscribe({ formState: { values: true }, callback: () => void trigger(failed) })
  }, [failed, subscribe, trigger])
  const go = (i: number) => {
    setFailed(null)
    setIndex(i)
    window.scrollTo({ top: 0 })
  }
  return {
    enabled,
    sections,
    current,
    title,
    section: sections[current],
    first: current === 0,
    last: current >= sections.length - 1,
    /** مرحله‌ی بعد، اگر فیلدهای این مرحله درست باشند؛ وگرنه فوکوس روی نخستین خطا. */
    next: async () => {
      const names = valueNames(sections[current])
      if (await form.trigger(names)) go(current + 1)
      else {
        setFailed(names)
        window.setTimeout(() => document.querySelector<HTMLElement>("main [aria-invalid=true]")?.focus())
      }
    },
    prev: () => go(current - 1),
    /** پس از ثبت نهایی ناموفق: نخستین مرحله‌ای که خطا دارد. */
    showErrors: (errors: FieldErrors<FormValues>) => {
      const i = sections.findIndex((s) => valueNames(s).some((n) => n in errors))
      if (i >= 0 && i !== current) go(i)
    },
  }
}

