import type { Control } from "react-hook-form"
import type { ChoiceOption, FieldDef, FormValues } from "./definition"

export type FieldProps = { field: FieldDef; control: Control<FormValues>; className?: string; layout?: "side" | "stacked" | "cell" }

/** ویژگی مشترک FormField هر فیلد. */
export function common({ field, control, className, layout }: FieldProps) {
  return { control, name: field.id, label: field.label ?? "", required: field.required, description: field.help || undefined, className, layout }
}

export const optionsOf = (field: FieldDef, key = "options") => (field.props?.[key] ?? []) as ChoiceOption[]
export const str = (value: unknown) => (typeof value === "string" ? value : "")

/** شناسه‌های فایل یک فیلد (پیوست، صدا) به شکل فهرست. */
export const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : value === "" || value == null ? [] : [String(value)])
