import { expect, test } from "@playwright/test"
import { collectErrors, expectAccessible } from "./helpers"

test.describe("تأیید با یک کلیک از ایمیل", () => {
  test("صفحه‌ی عمومی پیوند، بی ورود؛ پیوند نامعتبر پیام فارسی می‌گیرد", async ({ browser }, info) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, ...(info.project.use.viewport ? { viewport: info.project.use.viewport } : {}) })
    const page = await context.newPage()
    const errors = collectErrors(page)
    await page.goto("/quick/not-a-real-token")
    await expect(page.getByRole("heading", { level: 1, name: "ثبت تصمیم از ایمیل" })).toBeVisible()
    await expect(page.getByText("این پیوند معتبر نیست.")).toBeVisible()
    await expect(page.getByRole("button", { name: /^ثبت/ })).toHaveCount(0)
    await expect(page).toHaveURL(/\/quick\/not-a-real-token$/)
    await expectAccessible(page)
    expect(errors).toEqual([])
    await context.close()
  })
})
