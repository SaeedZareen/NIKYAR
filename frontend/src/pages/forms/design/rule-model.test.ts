import { describe, expect, it } from "vitest"
import { conditionLogic, formulaLogic, parseCondition, parseFormula, type Condition, type Formula } from "./rule-model"

describe("rule builder model", () => {
  it("round-trips conditions", () => {
    const cases: Condition[] = [
      { mode: "all", clauses: [{ field: "kind", op: "eq", right: { kind: "value", value: "sick" } }] },
      {
        mode: "any",
        clauses: [
          { field: "amount", op: "gt", right: { kind: "value", value: 1000 } },
          { field: "end", op: "gte", right: { kind: "field", field: "start" } },
          { field: "day", op: "lt", right: { kind: "today" } },
          { field: "tags", op: "has", right: { kind: "value", value: "a" } },
          { field: "note", op: "empty" },
          { field: "note", op: "filled" },
        ],
      },
    ]
    for (const c of cases) expect(parseCondition(conditionLogic(c))).toEqual(c)
    expect(conditionLogic(cases[0])).toEqual({ "==": [{ var: "kind" }, "sick"] })
    expect(parseCondition({ cat: ["a", "b"] })).toBeNull()
    // شرط نیمه‌کاره (مقدار انتخاب نشده) هم در سازنده می‌ماند
    expect(parseCondition(conditionLogic({ mode: "all", clauses: [{ field: "kind", op: "eq" }] }))).toEqual({
      mode: "all",
      clauses: [{ field: "kind", op: "eq", right: { kind: "value", value: "" } }],
    })
  })

  it("keeps half-built rules readable (field not chosen yet)", () => {
    const f: Formula = { op: "sum", operands: [{ kind: "field", field: "" }, { kind: "value", value: 0 }] }
    expect(parseFormula(formulaLogic(f))).toEqual(f)
    const c: Condition = { mode: "all", clauses: [{ field: "", op: "filled" }] }
    expect(parseCondition(conditionLogic(c))).toEqual(c)
  })

  it("round-trips formulas", () => {
    const cases: Formula[] = [
      { op: "sum", operands: [{ kind: "field", field: "a" }, { kind: "field", field: "b" }, { kind: "value", value: 5 }] },
      { op: "div", operands: [{ kind: "field", field: "a" }, { kind: "value", value: 2 }] },
      { op: "days", operands: [{ kind: "field", field: "start" }, { kind: "field", field: "end" }] },
    ]
    for (const f of cases) expect(parseFormula(formulaLogic(f))).toEqual(f)
    expect(formulaLogic(cases[2])).toEqual({ days_between: [{ var: "start" }, { var: "end" }] })
  })
})
