// مدل سازنده‌ی دیداری قاعده‌ها: شرط‌ها و فرمول‌هایی که کاربر با فهرست‌های کشویی می‌سازد، به JsonLogic و برعکس.
// فقط شکل‌هایی که خود سازنده می‌سازد خوانده می‌شوند؛ عبارت دیگر «پیشرفته» است و فقط حذف‌شدنی.
import type { FieldDef, FieldType, FormDefinition } from "@/components/form-renderer/definition"

export type Operand = { kind: "value"; value: string | number | boolean } | { kind: "field"; field: string } | { kind: "today" }
export type Op = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "empty" | "filled" | "has"
export type Clause = { field: string; op: Op; right?: Operand }
export type Condition = { mode: "all" | "any"; clauses: Clause[] }

export const OP_LABELS: Record<Op, string> = {
  eq: "برابر است با",
  ne: "برابر نیست با",
  gt: "بیشتر / بعد از",
  gte: "بیشتر یا برابر",
  lt: "کمتر / پیش از",
  lte: "کمتر یا برابر",
  empty: "خالی است",
  filled: "پر شده است",
  has: "شامل این گزینه است",
}
const BINARY: Partial<Record<Op, string>> = { eq: "==", ne: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }
const UNARY = new Set<Op>(["empty", "filled"])
export const needsRight = (op: Op) => !UNARY.has(op)

const ORDERED = new Set<FieldType>(["number", "amount", "scale", "calculated", "date", "datetime", "time"])
const CHOICES = new Set<FieldType>(["choice", "boolean", "lookup"])

/** عملگرهای مناسب هر نوع فیلد. */
export function opsFor(field: FieldDef): Op[] {
  const multiple = field.type === "multi_choice" || (field.type === "lookup" && field.props?.multiple === true)
  if (multiple) return ["has", "empty", "filled"]
  if (ORDERED.has(field.type)) return ["eq", "ne", "gt", "gte", "lt", "lte", "empty", "filled"]
  if (CHOICES.has(field.type)) return ["eq", "ne", "empty", "filled"]
  return ["eq", "ne", "empty", "filled"]
}

const v = (name: string) => ({ var: name })
function operandLogic(o: Operand | undefined): unknown {
  // مقدار هنوز انتخاب‌نشده: رشته‌ی خالی (تا شرط نیمه‌کاره هم در سازنده خوانده شود)
  if (!o) return ""
  if (o.kind === "field") return v(o.field)
  if (o.kind === "today") return { today: [] }
  return o.value
}

export function clauseLogic(c: Clause): unknown {
  if (c.op === "empty") return { "!": v(c.field) }
  if (c.op === "filled") return { "!!": v(c.field) }
  if (c.op === "has") return { in: [operandLogic(c.right), v(c.field)] }
  return { [BINARY[c.op]!]: [v(c.field), operandLogic(c.right)] }
}

export function conditionLogic(c: Condition): unknown {
  const parts = c.clauses.map(clauseLogic)
  return parts.length === 1 ? parts[0] : { [c.mode === "all" ? "and" : "or"]: parts }
}

const varName = (x: unknown): string | null =>
  x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 1 && typeof (x as { var?: unknown }).var === "string" ? (x as { var: string }).var : null

function parseOperand(x: unknown): Operand | null {
  const name = varName(x)
  if (name) return { kind: "field", field: name }
  if (x && typeof x === "object" && "today" in (x as object)) return { kind: "today" }
  if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") return { kind: "value", value: x }
  return null
}

function parseClause(logic: unknown): Clause | null {
  if (!logic || typeof logic !== "object" || Array.isArray(logic)) return null
  const [op, args] = Object.entries(logic)[0] ?? []
  if (op === "!" || op === "!!") {
    const field = varName(Array.isArray(args) ? args[0] : args)
    return field ? { field, op: op === "!" ? "empty" : "filled" } : null
  }
  if (!Array.isArray(args) || args.length !== 2) return null
  if (op === "in") {
    const field = varName(args[1])
    const right = parseOperand(args[0])
    return field && right ? { field, op: "has", right } : null
  }
  const found = (Object.entries(BINARY) as [Op, string][]).find(([, sym]) => sym === op)
  const field = varName(args[0])
  const right = parseOperand(args[1])
  return found && field && right ? { field, op: found[0], right } : null
}

/** JsonLogic ← شرط سازنده؛ null یعنی عبارت پیشرفته‌ای که سازنده نمی‌سازد. */
export function parseCondition(logic: unknown): Condition | null {
  if (logic && typeof logic === "object" && !Array.isArray(logic)) {
    const [op, args] = Object.entries(logic)[0] ?? []
    if ((op === "and" || op === "or") && Array.isArray(args)) {
      const clauses = args.map(parseClause)
      return clauses.every(Boolean) ? { mode: op === "and" ? "all" : "any", clauses: clauses as Clause[] } : null
    }
  }
  const single = parseClause(logic)
  return single ? { mode: "all", clauses: [single] } : null
}

// ─── فرمول فیلد محاسبه‌ای ───────────────────────────────────────────────

export type FormulaOp = "sum" | "sub" | "mul" | "div" | "days"
export type Formula = { op: FormulaOp; operands: Operand[] }
export const FORMULA_LABELS: Record<FormulaOp, string> = {
  sum: "جمع",
  sub: "تفاضل (اولی منهای دومی)",
  mul: "ضرب",
  div: "تقسیم (اولی بر دومی)",
  days: "شمار روز بین دو تاریخ (هر دو سر شامل)",
}
const FORMULA_SYMBOLS: Record<Exclude<FormulaOp, "days">, string> = { sum: "+", sub: "-", mul: "*", div: "/" }

export function formulaLogic(f: Formula): unknown {
  const args = f.operands.map(operandLogic)
  return f.op === "days" ? { days_between: args.slice(0, 2) } : { [FORMULA_SYMBOLS[f.op]]: f.op === "sum" ? args : args.slice(0, 2) }
}

export function parseFormula(logic: unknown): Formula | null {
  if (!logic || typeof logic !== "object" || Array.isArray(logic)) return null
  const [sym, args] = Object.entries(logic)[0] ?? []
  if (!Array.isArray(args)) return null
  const operands = args.map(parseOperand)
  if (!operands.every(Boolean)) return null
  if (sym === "days_between") return { op: "days", operands: operands as Operand[] }
  const op = (Object.entries(FORMULA_SYMBOLS) as [FormulaOp, string][]).find(([, s]) => s === sym)?.[0]
  return op ? { op, operands: operands as Operand[] } : null
}

/** نوع‌هایی که در قاعده‌ها می‌شود به آن‌ها اشاره کرد (مقدار ساده دارند). */
const REFERABLE = new Set<FieldType>([
  "text",
  "number",
  "amount",
  "date",
  "time",
  "datetime",
  "boolean",
  "choice",
  "multi_choice",
  "scale",
  "lookup",
  "calculated",
  "national_code",
  "mobile",
  "postal_code",
  "email",
])

export function referableFields(def: FormDefinition, except?: string): FieldDef[] {
  return def.sections.flatMap((s) => s.fields).filter((f) => REFERABLE.has(f.type) && f.id !== except)
}
