// تعریف فرم فرم‌ساز (هم‌ارز backend/core/forms/engine.py) و تبدیل میان داده‌ی ذخیره‌شده و حالت ورودی‌ها.

export type FieldType =
  | "heading"
  | "paragraph"
  | "divider"
  | "text"
  | "textarea"
  | "number"
  | "amount"
  | "date"
  | "time"
  | "date_range"
  | "boolean"
  | "choice"
  | "multi_choice"
  | "national_code"
  | "legal_national_id"
  | "mobile"
  | "phone"
  | "postal_code"
  | "iban"
  | "card_number"
  | "email"
  | "lookup"
  | "user"
  | "org_unit"
  | "position"
  | "attachment"
  | "signature"
  | "table"

export type ChoiceOption = { value: string; label: string }

export type FieldDef = {
  id: string
  type: FieldType
  label?: string
  help?: string
  required?: boolean
  span?: number
  default?: unknown
  props?: Record<string, unknown>
}

export type SectionDef = { id: string; title?: string; help?: string; columns?: number; fields: FieldDef[] }
export type FormDefinition = { sections: SectionDef[] }

/** مقدار ورودی‌ها در react-hook-form (متن عدد تا پیش از ارسال متن می‌ماند). */
export type FormValues = Record<string, unknown>

const DISPLAY_TYPES: ReadonlySet<FieldType> = new Set(["heading", "paragraph", "divider"])

export const isDisplay = (field: FieldDef) => DISPLAY_TYPES.has(field.type)

export function valueFields(definition: FormDefinition): FieldDef[] {
  return definition.sections.flatMap((s) => s.fields).filter((f) => !isDisplay(f))
}

/** برچسب هر فیلد برای خلاصه‌ی خطا. */
export function fieldLabels(definition: FormDefinition): Record<string, string> {
  return Object.fromEntries(valueFields(definition).map((f) => [f.id, f.label ?? f.id]))
}

/** حالت ورودی یک مقدار: عدد به متن، بله/خیر به «true»/«false»؛ مقدار نبود به حالت خالی همان نوع. */
function toInput(field: FieldDef, value: unknown): unknown {
  switch (field.type) {
    case "number":
    case "amount":
      return typeof value === "number" ? String(value) : ""
    case "boolean":
      return typeof value === "boolean" ? String(value) : ""
    case "multi_choice":
      return Array.isArray(value) ? value : []
    default:
      return value ?? ""
  }
}

/** مقدار اولیه‌ی ورودی‌ها از داده‌ی ثبت (یا مقدار پیش‌فرض هر فیلد برای فرم تازه). */
export function toFormValues(definition: FormDefinition, data?: Record<string, unknown>): FormValues {
  return Object.fromEntries(valueFields(definition).map((f) => [f.id, toInput(f, data ? data[f.id] : f.default)]))
}

const NUMBER = /^-?\d+(\.\d+)?$/

/** داده‌ی ارسالی: متن عدد به عدد (متن نادرست می‌ماند تا خطای «باید عدد باشد» بگیرد)، سپس پاک‌سازی مثل سرور. */
export function toPayload(definition: FormDefinition, values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of valueFields(definition)) {
    let value = values[field.id]
    if ((field.type === "number" || field.type === "amount") && typeof value === "string" && NUMBER.test(value.trim())) value = Number(value)
    if (field.type === "boolean" && (value === "true" || value === "false")) value = value === "true"
    const cleaned = clean(value)
    if (cleaned !== undefined) payload[field.id] = cleaned
  }
  return payload
}

/** مقدار خالی (متن خالی، فهرست خالی، شیء خالی) یعنی «پر نشده»؛ هم‌ارز engine.clean سرور. */
export function clean(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value.trim() || undefined
  if (Array.isArray(value)) {
    const items = value.map(clean).filter((v) => v !== undefined)
    return items.length ? items : undefined
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).flatMap(([k, v]) => {
      const c = clean(v)
      return c === undefined ? [] : [[k, c] as const]
    })
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return value
}

/** کلاس پهنای فیلدی که span ستون از columns ستون بخش می‌گیرد (هماهنگ با FormGrid). */
export function spanClass(span: number | undefined, columns: number): string {
  const s = span ?? 1
  if (s >= columns) return "col-span-full"
  return s === 2 ? "@2xl:col-span-2" : ""
}
