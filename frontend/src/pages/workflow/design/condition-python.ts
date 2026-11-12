// شرط سازنده‌ی دیداری (JsonLogic همان سازنده‌ی فرم‌ساز) ← عبارت امن پایتون برای شرط مسیرهای فرایند
// (همان زیرمجموعه‌ای که core/workflow/expressions.py می‌پذیرد).
import { isGroup, parseCondition, type Clause, type Condition, type Operand } from "@/pages/forms/design/rule-model"

const literal = (v: string | number | boolean) => (typeof v === "boolean" ? (v ? "True" : "False") : typeof v === "number" ? String(v) : JSON.stringify(v))

function operand(o: Operand | undefined): string {
  if (!o) return '""'
  if (o.kind === "field") return o.field || '""'
  if (o.kind === "today") return "today()"
  return literal(o.value)
}

const SYMBOLS = { eq: "==", ne: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const

function clause(c: Clause): string {
  if (c.op === "empty") return `not ${c.field}`
  if (c.op === "filled") return `not not ${c.field}`
  if (c.op === "has") return `${operand(c.right)} in ${c.field}`
  return `${c.field} ${SYMBOLS[c.op]} ${operand(c.right)}`
}

function group(g: Condition, nested: boolean): string {
  const parts = g.clauses.map((item) => (isGroup(item) ? group(item, true) : g.clauses.length > 1 ? `(${clause(item)})` : clause(item)))
  const joined = parts.join(g.mode === "all" ? " and " : " or ")
  return nested && parts.length > 1 ? `(${joined})` : joined
}

/** عبارت پایتون از شرط سازنده؛ null یعنی شرط با سازنده ساخته نشده است. */
export function conditionPython(logic: unknown): string | null {
  const parsed = parseCondition(logic)
  return parsed ? group(parsed, false) : null
}
