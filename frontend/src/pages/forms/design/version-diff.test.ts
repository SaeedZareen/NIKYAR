import { describe, expect, it } from "vitest"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { diffDefinitions, isEmptyDiff } from "./version-diff"

const v1: FormDefinition = {
  sections: [
    {
      id: "a",
      title: "درخواست",
      columns: 2,
      fields: [
        { id: "title", type: "text", label: "عنوان", required: true },
        { id: "qty", type: "number", label: "تعداد", props: { max: 10 } },
        { id: "items", type: "table", label: "اقلام", props: { columns: [{ id: "name", type: "text", label: "شرح" }] } },
      ],
    },
    { id: "b", title: "پیوست", fields: [{ id: "old", type: "text", label: "قدیمی" }] },
  ],
}

describe("مقایسه‌ی نسخه‌ها", () => {
  it("نسخه‌ی یکسان تفاوتی ندارد", () => {
    expect(isEmptyDiff(diffDefinitions(v1, structuredClone(v1)))).toBe(true)
  })

  it("فیلد و بخش افزوده، حذف‌شده و تغییرکرده، حتی درون گروه", () => {
    const v2: FormDefinition = {
      steps: true,
      sections: [
        {
          id: "a",
          title: "درخواست خرید",
          columns: 3,
          fields: [
            { id: "title", type: "text", label: "موضوع", visible_if: { "!!": [{ var: "qty" }] } },
            { id: "qty", type: "number", label: "تعداد", props: { max: 20 } },
            { id: "items", type: "table", label: "اقلام", props: { columns: [{ id: "name", type: "text", label: "شرح کالا" }, { id: "price", type: "amount", label: "فی" }] } },
          ],
        },
        { id: "c", title: "تأیید", fields: [{ id: "ok", type: "boolean", label: "تأیید" }] },
      ],
    }
    const d = diffDefinitions(v1, v2, (_t, n) => ({ max: "بیشینه" })[n] ?? n)
    expect(d.form).toEqual(["نمایش مرحله‌ای: خیر ← بله"])
    expect(d.sections).toEqual([
      { kind: "changed", id: "a", label: "درخواست خرید", details: ["عنوان: «درخواست» ← «درخواست خرید»", "ستون‌ها: ۲ ← ۳"] },
      { kind: "added", id: "c", label: "تأیید", details: [] },
      { kind: "removed", id: "b", label: "پیوست", details: [] },
    ])
    const byId = Object.fromEntries(d.fields.map((c) => [c.id, c]))
    expect(byId.title.details).toEqual(["برچسب: «عنوان» ← «موضوع»", "الزامی: بله ← خیر", "شرط نمایش افزوده شد"])
    expect(byId.qty.details).toEqual(["ویژگی‌ها: بیشینه"])
    expect(byId.name.details).toEqual(["برچسب: «شرح» ← «شرح کالا»"])
    expect(byId.price).toMatchObject({ kind: "added", details: ["گروه «اقلام»"] })
    expect(byId.old).toMatchObject({ kind: "removed", details: ["بخش «پیوست»"] })
    expect(byId.ok.kind).toBe("added")
    expect(byId.items).toBeUndefined()
  })
})
