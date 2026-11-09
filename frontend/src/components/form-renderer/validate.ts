// اعتبارسنجی داده‌ی فرم در مرورگر با همان JSON Schema سرور (ajv، پیش‌نویس 2020-12).
// پیام‌ها از x-messages همان طرح خوانده می‌شوند؛ پس متن خطاها فقط در سرور نوشته شده است.
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020"
import type { FieldErrors, Resolver } from "react-hook-form"
import { parseJalali, toFaDigits } from "@/lib/format"
import {
  isValidCardNumber,
  isValidEmail,
  isValidIban,
  isValidLegalNationalId,
  isValidMobile,
  isValidNationalId,
  isValidPhone,
  isValidPostalCode,
} from "@/lib/validators"
import { toPayload, type FormDefinition, type FormValues } from "./definition"
import { applyRules, formRuleErrors } from "./rules"

export type JsonSchema = Record<string, unknown>

type SchemaNode = {
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  "x-nikyar-type"?: string
  "x-messages"?: Record<string, string>
}

const isJalaliDate = (v: string) => /^\d{4}\/\d{2}\/\d{2}$/.test(v) && parseJalali(v) !== undefined

const ajv = new Ajv2020({ allErrors: true, strict: false })
// سرور فقط شکل یکسان‌شده (رقم لاتین) را می‌پذیرد؛ پس اینجا هم شکل دیگر نادرست است.
const canonical = (check: (v: string) => boolean) => (value: string) => /^\d+$/.test(value) && check(value)
const FORMATS: Record<string, (value: string) => boolean> = {
  "jalali-date": isJalaliDate,
  "jalali-datetime": (v) => v.length === 16 && v[10] === " " && isJalaliDate(v.slice(0, 10)) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.slice(11)),
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  email: isValidEmail,
  "ir-national-code": canonical(isValidNationalId),
  "ir-legal-national-id": canonical(isValidLegalNationalId),
  "ir-mobile": (v) => /^09\d{9}$/.test(v) && isValidMobile(v),
  "ir-phone": canonical(isValidPhone),
  "ir-postal-code": canonical(isValidPostalCode),
  "ir-iban": (v) => /^IR\d{24}$/.test(v) && isValidIban(v),
  "ir-card-number": canonical(isValidCardNumber),
}
for (const [name, validate] of Object.entries(FORMATS)) ajv.addFormat(name, { type: "string", validate })

const compiled = new WeakMap<JsonSchema, ValidateFunction>()

function message(node: SchemaNode, keyword: string): string {
  const messages = node["x-messages"] ?? {}
  return messages[keyword] ?? messages.invalid ?? "مقدار معتبر نیست."
}

/**
 * خطاهای داده با کلید شناسه‌ی فیلد (یا «جدول.ردیف.ستون» برای خانه‌های جدول)؛ برای هر کلید فقط نخستین پیام.
 * هم‌ارز engine.validate_data سرور برای بررسی‌هایی که در مرورگر ممکن است.
 */
export function validate(schema: JsonSchema, payload: Record<string, unknown>): Record<string, string> {
  let fn = compiled.get(schema)
  if (!fn) {
    fn = ajv.compile(schema)
    compiled.set(schema, fn)
  }
  if (fn(payload)) return {}
  const root = schema as SchemaNode
  const errors: Record<string, string> = {}
  for (const err of fn.errors ?? []) {
    const path = err.instancePath.split("/").slice(1)
    if (err.keyword === "required") path.push(String((err.params as { missingProperty: string }).missingProperty))
    const [id, row, column] = path
    const node = root.properties?.[id]
    if (!node) continue
    let key = id
    let text = message(node, err.keyword)
    const columnNode = column !== undefined ? node.items?.properties?.[column] : undefined
    if (node["x-nikyar-type"] === "table" && columnNode) {
      key = `${id}.${row}.${column}`
      text = `ردیف ${toFaDigits(Number(row) + 1)}: ${message(columnNode, err.keyword)}`
    }
    errors[key] ??= text
  }
  return errors
}

/** نوع‌هایی که مقدارشان را سرور می‌گذارد (امضا، ثبت‌کننده، محاسبه‌ای). */
const SERVER_TYPES = new Set(["signature", "submitter", "calculated"])

/**
 * سنجش کامل مثل engine.validate_data سرور: قاعده‌ها (پنهان، الزامی شرطی، محاسبه)، طرح JSON، الزامی‌های شرطی و
 * سپس قاعده‌های بین فیلدها. کلید «__form__» پیام کلی است.
 */
export function validateForm(definition: FormDefinition, schema: JsonSchema, payload: Record<string, unknown>, partial: boolean): Record<string, string> {
  const { values, state } = applyRules(definition, payload)
  const errors = validate(schema, values)
  const root = schema as SchemaNode
  if (!partial)
    for (const f of definition.sections.flatMap((s) => s.fields)) {
      if (SERVER_TYPES.has(f.type) || state.hidden.has(f.id) || f.id in values) continue
      const node = root.properties?.[f.id]
      if ((f.required || state.required.has(f.id)) && node) errors[f.id] ??= message(node, "required")
    }
  if (!partial && Object.keys(errors).length === 0) Object.assign(errors, formRuleErrors(definition, values, state.hidden))
  return errors
}

/** حل‌کننده‌ی react-hook-form: داده‌ی ارسالی را مثل سرور می‌سنجد و خطاها را روی فیلدها می‌نشاند. */
export function formResolver(definition: FormDefinition, schema: JsonSchema): Resolver<FormValues> {
  return async (values) => {
    const { __form__: general, ...errors } = validateForm(definition, schema, toPayload(definition, values), false)
    if (general) errors["root.server"] = general
    if (Object.keys(errors).length === 0) return { values, errors: {} }
    const nested: Record<string, unknown> = {}
    for (const [key, message] of Object.entries(errors)) {
      const parts = key.split(".")
      let node = nested
      for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>
      node[parts[parts.length - 1]] = { type: "validate", message }
    }
    return { values: {}, errors: nested as FieldErrors<FormValues> }
  }
}
