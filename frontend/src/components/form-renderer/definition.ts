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
  | "calculated"
  | "image"
  | "download"
  | "url"
  | "rich_text"
  | "voice"
  | "barcode"
  | "location"
  | "hidden"

export type ChoiceOption = { value: string; label: string }

export type FieldDef = {
  id: string
  type: FieldType
  label?: string
  help?: string
  required?: boolean
  /** فقط‌خواندنی همیشگی (مقدار پیش‌فرض یا پیش‌پر). */
  readonly?: boolean
  /** همین مقدار در ثبت نهایی دیگری از همین فرم نیاید (بررسی سرور). */
  unique?: boolean
  /** پیش‌پر از «حساب من». */
  prefill?: PrefillSource
  span?: number
  /** شروع از ردیف تازه (فیلد پس از فیلدهای قبلی در ستون اول می‌نشیند). */
  new_row?: boolean
  default?: unknown
  props?: Record<string, unknown>
  /** قاعده‌های JsonLogic (rules.ts) */
  visible_if?: unknown
  required_if?: unknown
  readonly_if?: unknown
}

type LabelPosition = "auto" | "side" | "top"
export type SectionDef = { id: string; title?: string; help?: string; columns?: number; labels?: LabelPosition; fields: FieldDef[]; visible_if?: unknown }
/** قاعده‌ی بین فیلدها: condition باید درست باشد وگرنه message زیر field می‌آید. */
export type FormRule = { id: string; condition: unknown; message: string; field?: string | null }
/**
 * ویژگی‌های سطح فرم: steps نمایش مرحله‌ای؛ required_mark نشانه‌ی الزامی؛ numbered شماره‌ی فیلدها؛ submit_label متن دکمه‌ی ثبت؛
 * intro متن آغاز و confirmation پیام صفحه‌ی تأیید (قالب‌دار، با جای‌گذارهای {شماره}، {نام}، {تاریخ}، {فرم}).
 */
export type FormDefinition = {
  sections: SectionDef[]
  rules?: FormRule[]
  steps?: boolean
  required_mark?: "star" | "word" | "optional"
  numbered?: boolean
  submit_label?: string
  intro?: string
  confirmation?: string
}

/** مقدار ورودی‌ها در react-hook-form (متن عدد تا پیش از ارسال متن می‌ماند). */
export type FormValues = Record<string, unknown>

const DISPLAY_TYPES: ReadonlySet<FieldType> = new Set(["heading", "paragraph", "divider", "image", "download"])

export const isDisplay = (field: FieldDef) => DISPLAY_TYPES.has(field.type)

function valueFields(definition: FormDefinition): FieldDef[] {
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
    case "voice":
      return Array.isArray(value) ? value : []
    case "location": {
      // عدد‌ها تا ارسال متن‌اند (مثل فیلد عدد)
      const v = (value ?? {}) as { lat?: unknown; lng?: unknown; accuracy?: unknown }
      const text = (n: unknown) => (typeof n === "number" ? String(n) : "")
      return { lat: text(v.lat), lng: text(v.lng), ...(typeof v.accuracy === "number" ? { accuracy: v.accuracy } : {}) }
    }
    case "table":
      return Array.isArray(value) ? value.map((row) => toItem(itemsOf(field), row as Record<string, unknown>)) : []
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

/** فیلدهای هر مورد گروه تکرارشونده. */
export const itemsOf = (field: FieldDef) => (field.props?.columns ?? []) as FieldDef[]

/** حالت ورودی یک مورد گروه؛ مورد تازه مقدار پیش‌فرض فیلدهایش را می‌گیرد. */
export function toItem(items: FieldDef[], row?: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(items.map((f) => [f.id, toInput(f, row ? row[f.id] : f.default)]))
}

/** پیش‌فرض پویای «امروز» یا «اکنون» (default_now) برای فرم تازه. */
function nowDefault(field: FieldDef, now: Date): string | undefined {
  if (field.props?.default_now !== true) return undefined
  const date = toJalaliString(now)
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  return { date, time, datetime: `${date} ${time}` }[field.type as "date" | "time" | "datetime"]
}

export type PrefillSource = "full_name" | "first_name" | "last_name" | "username" | "mobile" | "email"

/** کاربر جاری برای پیش‌فرض‌های «خودم» و «واحد من» و پیش‌پر از حساب. */
type CurrentUser = { id: number; unitId?: number; profile?: Partial<Record<PrefillSource, string>> }

function selfDefault(field: FieldDef, me?: CurrentUser): unknown {
  const multiple = field.props?.multiple === true
  const pick = (v: number | undefined) => (v === undefined ? undefined : multiple ? [v] : v)
  if (field.type === "user" && field.props?.default_self === true) return pick(me?.id)
  if (field.type === "org_unit" && field.props?.default_mine === true) return pick(me?.unitId)
  return undefined
}

function prefillDefault(field: FieldDef, me?: CurrentUser): string | undefined {
  return field.prefill ? me?.profile?.[field.prefill] || undefined : undefined
}

/** مقدار اولیه‌ی ورودی‌ها از داده‌ی ثبت؛ برای فرم تازه مقدار پیش‌فرض هر فیلد (ثابت، «امروز/اکنون»، «خودم»، «واحد من»، پیش‌پر، پارامتر نشانی). */
export function toFormValues(definition: FormDefinition, data?: Record<string, unknown>, me?: CurrentUser, query?: URLSearchParams, now = new Date()): FormValues {
  return Object.fromEntries(
    valueFields(definition).map((f) => {
      // فیلد پنهان: مقدار پارامتر نشانی صفحه (?param=…) در فرم تازه
      const param = f.type === "hidden" && !data && typeof f.props?.param === "string" ? query?.get(f.props.param) : null
      if (param) return [f.id, param]
      // گروه تازه با یک مورد خالی (یا به تعداد کمینه) شروع می‌شود تا پرکننده بی‌درنگ بنویسد.
      if (f.type === "table" && !data) return [f.id, Array.from({ length: Math.max(Number(f.props?.min_rows ?? 1), 1) }, () => toItem(itemsOf(f)))]
      return [f.id, toInput(f, data ? data[f.id] : (nowDefault(f, now) ?? selfDefault(f, me) ?? prefillDefault(f, me) ?? f.default))]
    })
  )
}

const NUMBER = /^-?\d+(\.\d+)?$/

/** داده‌ی ارسالی: متن عدد به عدد (متن نادرست می‌ماند تا خطای «باید عدد باشد» بگیرد)، سپس پاک‌سازی مثل سرور. */
export function toPayload(definition: FormDefinition, values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of valueFields(definition)) {
    const cleaned = clean(toValue(field, values[field.id]))
    if (cleaned !== undefined) payload[field.id] = cleaned
  }
  return payload
}

function toValue(field: FieldDef, value: unknown): unknown {
  if ((field.type === "number" || field.type === "amount" || field.type === "scale") && typeof value === "string" && NUMBER.test(value.trim())) return Number(value)
  // تعهد پذیرفته‌نشده یعنی پاسخ نداده (نه «false» که طرح آن را نادرست می‌داند).
  if (field.type === "consent" && value !== true) return undefined
  if (field.type === "boolean" && (value === "true" || value === "false")) return value === "true"
  if (field.type === "table" && Array.isArray(value)) return value.map((row) => rowValue(field, row))
  if (field.type === "location" && value && typeof value === "object") {
    const v = value as Record<string, unknown>
    const num = (n: unknown) => (typeof n === "string" && NUMBER.test(n.trim()) ? Number(n) : n)
    return { ...v, lat: num(v.lat), lng: num(v.lng) }
  }
  return value
}

const rowValue = (field: FieldDef, row: unknown) =>
  Object.fromEntries(itemsOf(field).map((f) => [f.id, toValue(f, (row as Record<string, unknown> | undefined)?.[f.id])]))

/**
 * کلید خطای خانه‌ی گروه («items.1.qty») در داده‌ی ارسالی به کلید همان خانه روی صفحه: مورد خالی ارسال نمی‌شود
 * (مثل سرور)، پس شماره‌ی مورد پس از آن روی صفحه بیشتر است.
 */
export function screenKey(definition: FormDefinition, values: FormValues, key: string): string {
  const [id, row, ...rest] = key.split(".")
  const field = row !== undefined && /^\d+$/.test(row) ? valueFields(definition).find((f) => f.id === id && f.type === "table") : undefined
  if (!field) return key
  const rows = Array.isArray(values[id]) ? (values[id] as unknown[]) : []
  const kept = rows.flatMap((r, i) => (clean(rowValue(field, r)) === undefined ? [] : [i]))
  return [id, String(kept[Number(row)] ?? row), ...rest].join(".")
}

/** مقدار خالی (متن خالی، فهرست خالی، شیء خالی) یعنی «پر نشده»؛ هم‌ارز engine.clean سرور. */
function clean(value: unknown): unknown {
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

/** کلاس پهنا و ردیف فیلد در شبکه‌ی ستون‌ثابت بخش (FormGrid fixed)؛ موبایل همیشه تک‌ستونه. */
export function spanClass(field: Pick<FieldDef, "span" | "new_row">, columns: number): string {
  const s = Math.min(field.span ?? 1, columns)
  const width = s >= columns ? "col-span-full" : s === 2 ? "md:col-span-2" : ""
  return [width, field.new_row ? "md:col-start-1" : ""].filter(Boolean).join(" ")
}

/** جای برچسب فیلدهای بخش: «خودکار» یعنی کنار فیلد تا دو ستون و بالای فیلد در بخش سه‌ستونه. */
export function labelLayout(section: Pick<SectionDef, "labels" | "columns">): "side" | "stacked" {
  const labels = section.labels ?? "auto"
  if (labels === "top") return "stacked"
  if (labels === "side") return "side"
  return (section.columns ?? 1) >= 3 ? "stacked" : "side"
}

/** کلاس چیدمان گزینه‌ها (رادیویی و چک‌باکس): پشت سر هم یا تعداد ستون ثابت. */
export function optionColumnsClass(value: unknown): string {
  return (
    {
      "1": "grid grid-cols-1 gap-y-2",
      "2": "grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2",
      "3": "grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3",
      "4": "grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4",
    }[String(value)] ?? "flex flex-wrap items-center gap-x-4 gap-y-2"
  )
}
