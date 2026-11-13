import { expect, test } from "@playwright/test"
import { expectAccessible } from "./helpers"

test.describe("ماژول‌ها و لایسنس", () => {
  test("نسخه‌ی آزمایشی، شناسه‌ی نصب، نوار هشدار و رد فایل نامعتبر", async ({ page }) => {
    await page.goto("/")
    const banner = page.getByRole("status").filter({ hasText: "نسخه‌ی آزمایشی" })
    await expect(banner).toContainText("روز مانده")
    await banner.getByRole("link", { name: "ماژول‌ها و لایسنس" }).click()

    const status = page.getByRole("region", { name: "وضعیت" })
    await expect(status).toContainText("آزمایشی (۳۰ روزه)")
    await expect(status).toContainText(/NK-[0-9A-F]{8}-[0-9A-F]{8}/)
    await expect(page.getByRole("region", { name: "ماژول‌ها" })).toContainText("پرونده‌ی پرسنلی")
    await expectAccessible(page)

    const upload = page.getByRole("region", { name: "بارگذاری لایسنس" })
    await upload.locator('input[type="file"]').setInputFiles({ name: "fake.nikyar-license", mimeType: "application/json", buffer: Buffer.from('{"payload":"e30=","signature":"AAAA"}') })
    await upload.getByRole("button", { name: "فعال‌سازی لایسنس" }).click()
    await expect(upload.getByRole("alert")).toContainText(/کلید عمومی صادرکننده|امضای لایسنس معتبر نیست/)
  })

  test("کاربر بدون مجوز نوار آزمایشی و صفحه‌ی لایسنس را نمی‌بیند", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto("/login")
    await page.getByLabel("نام کاربری", { exact: true }).fill("accountant")
    await page.getByLabel("گذرواژه", { exact: true }).fill("nikyar123")
    await page.getByRole("button", { name: "ورود" }).click()
    await expect(page.getByText("خوش آمدید", { exact: false })).toBeVisible()
    await expect(page.getByText("نسخه‌ی آزمایشی")).toHaveCount(0)
    await page.goto("/admin/license")
    await expect(page.getByRole("heading", { level: 1, name: "دسترسی ندارید" })).toBeVisible()
    await context.close()
  })
})
