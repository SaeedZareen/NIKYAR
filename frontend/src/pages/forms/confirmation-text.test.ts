import { describe, expect, it } from "vitest"
import { confirmationHtml } from "./confirmation-text"

describe("پیام صفحه‌ی تأیید", () => {
  it("جای‌گذارها با مقدار امن پر می‌شوند و پیام پیش‌فرض دارد", () => {
    const values = { number: "خ-۰۰۱", name: "<b>سارا</b>", date: "۱۴۰۵/۰۸/۱۸", form: "خرید" }
    expect(confirmationHtml("<p>{نام} عزیز، شماره‌ی {شماره} در {تاریخ} ثبت شد.</p>", values)).toBe("<p>&lt;b&gt;سارا&lt;/b&gt; عزیز، شماره‌ی خ-۰۰۱ در ۱۴۰۵/۰۸/۱۸ ثبت شد.</p>")
    expect(confirmationHtml(undefined, { ...values, number: "" })).toBe("<p>فرم «خرید» ثبت شد.</p>")
  })
})
