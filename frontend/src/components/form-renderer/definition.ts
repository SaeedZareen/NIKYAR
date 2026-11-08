import { toJalaliString } from "@/lib/format"

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
  | "datetime"
  | "time_range"
  | "boolean"
  | "choice"
  | "multi_choice"
  | "scale"
  | "matrix"
  | "consent"
  | "national_code"
  | "legal_national_id"
  | "economic_code"
  | "registration_number"
  | "vehicle_plate"
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
  | "signature_pad"
  | "region"
  | "submitter"
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
    case "scale":
      return typeof value === "number" ? String(value) : ""
    case "consent":
      return value === true
    case "date_range":
    case "time_range":
    case "matrix":
    case "region":
      return value && typeof value === "object" ? value : {}
    case "attachment":
      return Array.isArray(value) ? value : []
    case "lookup":
    case "user":
    case "org_unit":
    case "position":
      return field.props?.multiple === true ? (Array.isArray(value) ? value : []) : (value ?? "")
    case "boolean":
      return typeof value === "boolean" ? String(value) : ""
    case "multi_choice":
      return Array.isArray(value) ? value : []
    default:
      return value ?? ""
  }
}

/** پیش‌فرض پویای «امروز» یا «اکنون» (default_now) برای فرم تازه. */
function nowDefault(field: FieldDef, now: Date): string | undefined {
  if (field.props?.default_now !== true) return undefined
  const date = toJalaliString(now)
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  return { date, time, datetime: `${date} ${time}` }[field.type as "date" | "time" | "datetime"]
}

/** کاربر جاری برای پیش‌فرض‌های «خودم» و «واحد من». */
export type CurrentUser = { id: number; unitId?: number }

function selfDefault(field: FieldDef, me?: CurrentUser): unknown {
  const multiple = field.props?.multiple === true
  const pick = (v: number | undefined) => (v === undefined ? undefined : multiple ? [v] : v)
  if (field.type === "user" && field.props?.default_self === true) return pick(me?.id)
  if (field.type === "org_unit" && field.props?.default_mine === true) return pick(me?.unitId)
  return undefined
}

/** مقدار اولیه‌ی ورودی‌ها از داده‌ی ثبت؛ برای فرم تازه مقدار پیش‌فرض هر فیلد (ثابت، «امروز/اکنون»، «خودم»، «واحد من»). */
export function toFormValues(definition: FormDefinition, data?: Record<string, unknown>, me?: CurrentUser, now = new Date()): FormValues {
  return Object.fromEntries(
    valueFields(definition).map((f) => [f.id, toInput(f, data ? data[f.id] : (nowDefault(f, now) ?? selfDefault(f, me) ?? f.default))])
  )
}

const NUMBER = /^-?\d+(\.\d+)?$/

/** داده‌ی ارسالی: متن عدد به عدد (متن نادرست می‌ماند تا خطای «باید عدد باشد» بگیرد)، سپس پاک‌سازی مثل سرور. */
export function toPayload(definition: FormDefinition, values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of valueFields(definition)) {
    let value = values[field.id]
    if ((field.type === "number" || field.type === "amount" || field.type === "scale") && typeof value === "string" && NUMBER.test(value.trim())) value = Number(value)
    // تعهد پذیرفته‌نشده یعنی پاسخ نداده (نه «false» که طرح آن را نادرست می‌داند).
    if (field.type === "consent" && value !== true) value = undefined
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
