// قاعده‌های فرم در مرورگر: همان عبارت‌های JsonLogic و همان عملگرهای ویژه‌ی سرور (backend/core/forms/rules.py)،
// تا نمایش، الزام، فقط‌خواندنی و محاسبه هنگام پر کردن زنده باشد. نمونه‌های مشترک shared/vectors/form-rules.json.
import jsonLogic, { type RulesLogic } from "json-logic-js"
import { parseJalali, toJalaliString } from "@/lib/format"
import type { FieldDef, FormDefinition } from "./definition"

type Logic = unknown
export type RuleState = { hidden: Set<string>; hiddenSections: Set<string>; required: Set<string>; readonly: Set<string>; calculated: Record<string, number> }

/** شمار روز از start تا end، هر دو سر شامل؛ تاریخ نادرست ← null (هم‌ارز _days_between سرور). */
function daysBetween(start: unknown, end: unknown): number | null {
  const a = typeof start === "string" ? parseJalali(start) : undefined
  const b = typeof end === "string" ? parseJalali(end) : undefined
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** جمع یک ستون گروه تکرارشونده یا حاصل‌ضرب دو ستون در هر مورد (هم‌ارز _sum_of سرور). */
function sumOf(rows: unknown, column: unknown, factor?: unknown): number | null {
  if (!Array.isArray(rows)) return null
  let total = 0
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const a = num(r[String(column)])
    const b = factor === undefined ? 1 : num(r[String(factor)])
    if (a !== null && b !== null) total += a * b
  }
  return total
}

jsonLogic.add_operation("days_between", daysBetween)
jsonLogic.add_operation("sum_of", sumOf)
jsonLogic.add_operation("today", () => toJalaliString(new Date()))

/** اجرای عبارت؛ خطای اجرا ← null. */
function evaluate(logic: Logic, data: Record<string, unknown>): unknown {
  try {
    return jsonLogic.apply(logic as RulesLogic, data)
  } catch {
    return null
  }
}

const truthy = (value: unknown) => jsonLogic.truthy(value)

/** شناسه‌ی فیلدهایی که عبارت به آن‌ها اشاره می‌کند. */
export function variables(logic: Logic): Set<string> {
  const found = new Set<string>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === "object") {
      const [op, args] = Object.entries(node)[0] ?? []
      if (op === "var") {
        const name = Array.isArray(args) ? args[0] : args
        if (typeof name === "string") found.add(name.split(".")[0])
      } else walk(args)
    }
  }
  walk(logic)
  return found
}

function round(value: unknown, decimals: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

const fieldsOf = (def: FormDefinition): FieldDef[] => def.sections.flatMap((s) => s.fields)

/** هم‌ارز rules.apply سرور: داده‌ی نهایی (بدون پنهان‌ها، با محاسبه‌ها) و وضعیت هر فیلد. */
export function applyRules(def: FormDefinition, data: Record<string, unknown>): { values: Record<string, unknown>; state: RuleState } {
  let values: Record<string, unknown> = { ...data }
  let hidden = new Set<string>()
  let hiddenSections = new Set<string>()
  for (let pass = 0; pass < 5; pass++) {
    const nextHidden = new Set<string>()
    const nextSections = new Set<string>()
    for (const section of def.sections) {
      const sectionHidden = section.visible_if !== undefined && !truthy(evaluate(section.visible_if, values))
      if (sectionHidden) nextSections.add(section.id)
      for (const f of section.fields) {
        if (sectionHidden || (f.visible_if !== undefined && !truthy(evaluate(f.visible_if, values)))) nextHidden.add(f.id)
      }
    }
    values = Object.fromEntries(Object.entries(data).filter(([k]) => !nextHidden.has(k)))
    for (const f of fieldsOf(def)) {
      if (f.type !== "calculated" || nextHidden.has(f.id)) continue
      const formula = f.props?.formula
      const ready = [...variables(formula)].every((n) => n in values)
      const result = ready ? round(evaluate(formula, values), Number(f.props?.decimals ?? 0)) : null
      if (result === null) delete values[f.id]
      else values[f.id] = result
    }
    const stable = nextHidden.size === hidden.size && [...nextHidden].every((h) => hidden.has(h))
    hidden = nextHidden
    hiddenSections = nextSections
    if (stable) break
  }
  const state: RuleState = { hidden, hiddenSections, required: new Set(), readonly: new Set(), calculated: {} }
  for (const f of fieldsOf(def)) {
    if (f.type === "calculated" && typeof values[f.id] === "number") state.calculated[f.id] = values[f.id] as number
    if (hidden.has(f.id)) continue
    if (f.required_if !== undefined && truthy(evaluate(f.required_if, values))) state.required.add(f.id)
    if (f.readonly === true || (f.readonly_if !== undefined && truthy(evaluate(f.readonly_if, values)))) state.readonly.add(f.id)
  }
  return { values, state }
}

/** اعتبارسنجی بین فیلدها؛ قاعده‌ای که فیلدهایش پر نشده یا پنهان‌اند بررسی نمی‌شود (هم‌ارز form_rule_errors). */
export function formRuleErrors(def: FormDefinition, values: Record<string, unknown>, hidden: Set<string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const rule of def.rules ?? []) {
    const names = [...variables(rule.condition)]
    if (names.some((n) => !(n in values) || hidden.has(n))) continue
    const key = rule.field || "__form__"
    if (!truthy(evaluate(rule.condition, values))) errors[key] ??= rule.message
  }
  return errors
}
