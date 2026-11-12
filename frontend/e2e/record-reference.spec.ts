import { expect, test, type Page } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible } from "./helpers"

async function call(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: body ? JSON.stringify(body) : undefined })
      return r.json()
    },
    { method, url, body }
  )
}

const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

async function publish(page: Page, title: string, fields: object[], settings: object = {}) {
  const code = unique("ref")
  const form = await call(page, "POST", "/api/forms/", { code, title, fill_by_everyone: true, ...settings })
  await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition: { sections: [{ id: "s", fields }] } })
  await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
  return { id: form.id as number, code }
}

test.describe("ارجاع به ثبت یا درخواست", () => {
  test("انتخاب ثبت مرتبط با جست‌وجوی شماره و پیوند در مشاهده", async ({ page }, info) => {
    const errors = collectErrors(page)
    await page.goto("/forms")
    const purchase = await publish(page, `خرید ${info.project.name} ${Date.now()}`, [{ id: "item", type: "text", label: "کالا" }], {
      number_pattern: "خر-{seq:3}",
      number_reset: "never",
    })
    for (const item of ["میز", "صندلی"]) await call(page, "POST", "/api/forms/submissions/", { form: purchase.id, submit: true, data: { item } })
    const title = `تحویل کالا ${info.project.name} ${Date.now()}`
    const delivery = await publish(page, title, [{ id: "related", type: "record", label: "خرید مرتبط", required: true, props: { source: `form:${purchase.code}` } }])

    await page.goto(`/forms/${delivery.id}/fill`)
    await page.getByLabel("خرید مرتبط", { exact: true }).click()
    await expect(page.getByRole("option")).toHaveCount(2)
    await page.getByPlaceholder("جست‌وجوی شماره").fill("۰۰۲")
    await expect(page.getByRole("option")).toHaveCount(1)
    await page.getByRole("option", { name: /خر-۰۰۲/ }).click()
    await expect(page.getByLabel("خرید مرتبط", { exact: true })).toHaveText("خر-۰۰۲")
    await expectAccessible(page)
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByRole("dialog", { name: "مرور و تأیید نهایی" })).toContainText("خر-۰۰۲")
    await confirmReview(page)
    await expect(page.getByText(`فرم «${title}» ثبت شد.`)).toBeVisible()

    // مشاهده‌ی ثبت: شماره پیوند به ثبت خرید است
    const mine = await call(page, "GET", `/api/forms/submissions/?form=${delivery.id}&status=submitted`)
    await page.goto(`/forms/submissions/${mine.results[0].id}`)
    await page.getByRole("link", { name: "خر-۰۰۲" }).click()
    await expect(page.getByText("صندلی")).toBeVisible()
    expect(errors).toEqual([])
  })

  test("طراح: افزودن فیلد ارجاع و انتخاب فرم منبع", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "طراحی روی صفحه‌ی پهن؛ پر کردن در آزمون قبل روی هر سه اندازه")
    await page.goto("/forms")
    const sourceTitle = `منبع ارجاع ${Date.now()}`
    await publish(page, sourceTitle, [{ id: "item", type: "text", label: "کالا" }])
    await page.goto("/forms/design")
    await page.getByRole("button", { name: "فرم جدید", exact: true }).click()
    await page.getByLabel("عنوان", { exact: true }).fill(`فرم ارجاع ${Date.now()}`)
    await page.getByRole("button", { name: "ساخت و رفتن به طراح" }).click()
    await page.getByRole("button", { name: "افزودن «ارجاع به ثبت یا درخواست»" }).click()
    const props = page.getByRole("region", { name: "ویژگی‌ها" })
    // بی منبع، سرور تعریف را نمی‌پذیرد
    await expect(props.getByText("تکمیل «انتخاب از فرم یا فرایند» الزامی است.")).toBeVisible()
    await props.getByLabel("انتخاب از فرم یا فرایند", { exact: true }).click()
    await page.getByRole("option", { name: new RegExp(sourceTitle) }).click()
    await expect(props.getByText("تکمیل «انتخاب از فرم یا فرایند» الزامی است.")).toBeHidden()
    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    await expectAccessible(page)
  })
})
