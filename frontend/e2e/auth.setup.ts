import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, test as setup } from "@playwright/test"
import { expectAccessible } from "./helpers"

// پایگاه داده‌ی آزمون خالی است: صفحه‌ی ورود به «راه‌اندازی نخستین» می‌رود؛ کد را از پوشه‌ی داده‌ی سرور آزمون
// (start-backend.mjs) می‌خوانیم و «نسخه‌ی نمایشی» را می‌سازیم. سپس یک‌بار ورود با مدیر کل نمونه؛ بقیه‌ی آزمون‌ها با همین نشست.
setup("راه‌اندازی نخستین با نسخه‌ی نمایشی و ورود مدیر سامانه", async ({ page }) => {
  await page.goto("/login")
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole("heading", { level: 1, name: "راه‌اندازی نخستین نیک‌یار" })).toBeVisible()
  await expectAccessible(page)
  await page.getByLabel("کد راه‌اندازی", { exact: true }).fill("WRONG-CODE")
  await page.getByRole("radio", { name: "نسخه‌ی نمایشی" }).click()
  await page.getByRole("button", { name: "ساخت نسخه‌ی نمایشی" }).click()
  await expect(page.getByText("کد راه‌اندازی درست نیست").first()).toBeVisible()
  const code = readFileSync(path.join(tmpdir(), "nikyar-e2e", "setup_code"), "utf-8").trim()
  await page.getByLabel("کد راه‌اندازی", { exact: true }).fill(code.toLowerCase())
  await page.getByRole("button", { name: "ساخت نسخه‌ی نمایشی" }).click()
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 })

  await page.getByLabel("نام کاربری", { exact: true }).fill("admin")
  await page.getByLabel("گذرواژه", { exact: true }).fill("nikyar123")
  await page.getByRole("button", { name: "ورود" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "پیشخوان" })).toBeVisible()
  await page.context().storageState({ path: "e2e/.auth/admin.json" })
})
