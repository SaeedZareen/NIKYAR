import { describe, expect, it } from "vitest"
import { conditionLogic } from "@/pages/forms/design/rule-model"
import { conditionPython } from "./condition-python"

describe("شرط مسیر ← عبارت پایتون", () => {
  it("یک جمله", () => {
    expect(conditionPython({ "==": [{ var: "decision" }, "approve"] })).toBe('decision == "approve"')
    expect(conditionPython({ ">": [{ var: "amount" }, 100000] })).toBe("amount > 100000")
    expect(conditionPython({ "!": { var: "note" } })).toBe("not note")
    expect(conditionPython({ "!!": { var: "note" } })).toBe("not not note")
    expect(conditionPython({ in: ["a", { var: "tags" }] })).toBe('"a" in tags')
    expect(conditionPython({ "<": [{ var: "day" }, { today: [] }] })).toBe("day < today()")
    expect(conditionPython({ "==": [{ var: "urgent" }, true] })).toBe("urgent == True")
  })

  it("گروه‌های تودرتو با پرانتز", () => {
    const logic = conditionLogic({
      mode: "all",
      clauses: [
        { field: "decision", op: "eq", right: { kind: "value", value: "approve" } },
        { mode: "any", clauses: [{ field: "amount", op: "gt", right: { kind: "value", value: 5 } }, { field: "urgent", op: "eq", right: { kind: "value", value: true } }] },
      ],
    })
    expect(conditionPython(logic)).toBe('(decision == "approve") and ((amount > 5) or (urgent == True))')
  })

  it("متن با نقل‌قول امن می‌ماند", () => {
    expect(conditionPython({ "==": [{ var: "subject" }, 'a"b'] })).toBe('subject == "a\\"b"')
  })

  it("عبارت غیرسازنده", () => {
    expect(conditionPython({ "+": [1, 2] })).toBeNull()
  })
})
