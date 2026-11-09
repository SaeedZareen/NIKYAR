// مدل سازنده‌ی دیداری قاعده‌ها: شرط‌ها و فرمول‌هایی که کاربر با فهرست‌های کشویی می‌سازد، به JsonLogic و برعکس.
// فقط شکل‌هایی که خود سازنده می‌سازد خوانده می‌شوند؛ عبارت دیگر «پیشرفته» است و فقط حذف‌شدنی.
import { itemsOf, type FieldDef, type FieldType, type FormDefinition } from "@/components/form-renderer/definition"

export type Operand = { kind: "value"; value: string | number | boolean } | { kind: "field"; field: string } | { kind: "today" }
export type Op = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "empty" | "filled" | "has"
export type Clause = { field: string; op: Op; right?: Operand }
/** گروه شرط: «همه» (و) یا «یکی از» (یا)؛ هر عضو یک جمله یا گروهی تودرتو. */
export type Condition = { mode: "all" | "any"; clauses: (Clause | Condition)[] }
export const isGroup = (item: Clause | Condition): item is Condition => "mode" in item

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

function groupLogic(c: Condition): unknown {
  return { [c.mode === "all" ? "and" : "or"]: c.clauses.map((item) => (isGroup(item) ? groupLogic(item) : clauseLogic(item))) }
}

/** شرط ← JsonLogic. گروه بالایی با یک جمله بی‌پوشش می‌ماند؛ گروه‌های تودرتو همیشه «و/یا» دارند تا گروه بمانند. */
export function conditionLogic(c: Condition): unknown {
  if (c.clauses.length === 1 && !isGroup(c.clauses[0])) return clauseLogic(c.clauses[0])
  return groupLogic(c)
}

// شناسه‌ی خالی («فیلد دیگر» هنوز انتخاب نشده) هم خوانده می‌شود تا سازنده گیر نکند.
const varName = (x: unknown): string | null =>
  x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 1 && typeof (x as { var?: unknown }).var === "string" ? (x as { var: string }).var : null

function parseOperand(x: unknown): Operand | null {
  const name = varName(x)
  if (name !== null) return { kind: "field", field: name }
  if (x && typeof x === "object" && "today" in (x as object)) return { kind: "today" }
  if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") return { kind: "value", value: x }
  return null
}

function parseClause(logic: unknown): Clause | null {
  if (!logic || typeof logic !== "object" || Array.isArray(logic)) return null
  const [op, args] = Object.entries(logic)[0] ?? []
  if (op === "!" || op === "!!") {
    const field = varName(Array.isArray(args) ? args[0] : args)
    return field !== null ? { field, op: op === "!" ? "empty" : "filled" } : null
  }
  if (!Array.isArray(args) || args.length !== 2) return null
  if (op === "in") {
    const field = varName(args[1])
    const right = parseOperand(args[0])
    return field !== null && right ? { field, op: "has", right } : null
  }
  const found = (Object.entries(BINARY) as [Op, string][]).find(([, sym]) => sym === op)
  const field = varName(args[0])
  const right = parseOperand(args[1])
  return found && field !== null && right ? { field, op: found[0], right } : null
}

/** JsonLogic ← شرط سازنده؛ null یعنی عبارت پیشرفته‌ای که سازنده نمی‌سازد. */
function parseGroup(logic: unknown): Condition | null {
  if (!logic || typeof logic !== "object" || Array.isArray(logic)) return null
  const [op, args] = Object.entries(logic)[0] ?? []
  if ((op !== "and" && op !== "or") || !Array.isArray(args)) return null
  const items = args.map((a) => parseGroup(a) ?? parseClause(a))
  return items.every(Boolean) ? { mode: op === "and" ? "all" : "any", clauses: items as (Clause | Condition)[] } : null
}

export function parseCondition(logic: unknown): Condition | null {
  const group = parseGroup(logic)
  if (group) return group
  const single = parseClause(logic)
  return single ? { mode: "all", clauses: [single] } : null
}

// ─── فرمول فیلد محاسبه‌ای ───────────────────────────────────────────────

export type FormulaOp = "sum" | "sub" | "mul" | "div" | "days" | "group"
/** جمع یک گروه تکرارشونده: ستون column (و اگر factor هست، حاصل‌ضرب دو ستون در هر مورد). */
export type GroupSum = { table: string; column: string; factor?: string }
export type Formula = { op: FormulaOp; operands: Operand[]; group?: GroupSum }
export const FORMULA_LABELS: Record<FormulaOp, string> = {
  sum: "جمع",
  sub: "تفاضل (اولی منهای دومی)",
  mul: "ضرب",
  div: "تقسیم (اولی بر دومی)",
  days: "شمار روز بین دو تاریخ (هر دو سر شامل)",
  group: "جمع یک گروه تکرارشونده",
}
const FORMULA_SYMBOLS: Record<Exclude<FormulaOp, "days" | "group">, string> = { sum: "+", sub: "-", mul: "*", div: "/" }

export function formulaLogic(f: Formula): unknown {
  if (f.op === "group") {
    const g = f.group ?? { table: "", column: "" }
    return { sum_of: [{ var: g.table }, g.column, ...(g.factor ? [g.factor] : [])] }
  }
  const args = f.operands.map(operandLogic)
  return f.op === "days" ? { days_between: args.slice(0, 2) } : { [FORMULA_SYMBOLS[f.op]]: f.op === "sum" ? args : args.slice(0, 2) }
}

export function parseFormula(logic: unknown): Formula | null {
  if (!logic || typeof logic !== "object" || Array.isArray(logic)) return null
  const [sym, args] = Object.entries(logic)[0] ?? []
  if (!Array.isArray(args)) return null
  if (sym === "sum_of") {
    const [table, column, factor] = args as [{ var?: unknown } | undefined, unknown, unknown]
    if (typeof table?.var !== "string" || typeof column !== "string") return null
    return { op: "group", operands: [], group: { table: table.var, column, ...(typeof factor === "string" ? { factor } : {}) } }
  }
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
  "url",
  "barcode",
  "hidden",
])

export function referableFields(def: FormDefinition, except?: string): FieldDef[] {
  return def.sections.flatMap((s) => s.fields).filter((f) => REFERABLE.has(f.type) && f.id !== except)
}

/** گروه‌های تکرارشونده با ستون‌های عددی‌شان (برای «جمع یک گروه»). */
export function numericGroups(def: FormDefinition): { group: FieldDef; columns: FieldDef[] }[] {
  return def.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.type === "table")
    .map((group) => ({ group, columns: itemsOf(group).filter((c) => c.type === "number" || c.type === "amount") }))
    .filter((g) => g.columns.length > 0)
}
