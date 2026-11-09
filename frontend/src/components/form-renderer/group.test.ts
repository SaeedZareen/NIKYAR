import { describe, expect, it } from "vitest"
import { screenKey, toFormValues, toPayload, type FormDefinition } from "./definition"

const definition: FormDefinition = {
  sections: [
    {
      id: "s",
      fields: [
        {
          id: "items",
          type: "table",
          label: "اقلام",
          props: {
            min_rows: 2,
            columns: [
              { id: "name", type: "text", label: "شرح" },
              { id: "qty", type: "number", label: "تعداد", default: 1 },
            ],
          },
        },
      ],
    },
  ],
}

describe("گروه تکرارشونده", () => {
  it("فرم تازه به تعداد کمینه مورد با پیش‌فرض فیلدها دارد", () => {
    expect(toFormValues(definition).items).toEqual([
      { name: "", qty: "1" },
      { name: "", qty: "1" },
    ])
  })

  it("عدد خانه‌ها عدد می‌شود و مورد خالی ارسال نمی‌شود", () => {
    const values = { items: [{ name: "کاغذ", qty: "2" }, { name: " ", qty: "" }, { name: "قلم", qty: "x" }] }
    expect(toPayload(definition, values)).toEqual({ items: [{ name: "کاغذ", qty: 2 }, { name: "قلم", qty: "x" }] })
    // خطای مورد دوم داده‌ی ارسالی همان مورد سوم صفحه است
    expect(screenKey(definition, values, "items.1.qty")).toBe("items.2.qty")
    expect(screenKey(definition, values, "items")).toBe("items")
  })
})
