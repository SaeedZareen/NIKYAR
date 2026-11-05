import { expect, test as setup } from "@playwright/test"

// یک‌بار ورود با کاربر مدیر کل نمونه؛ بقیه‌ی آزمون‌ها با همین نشست اجرا می‌شوند.
setup("ورود مدیر سامانه", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("نام کاربری").fill("admin")
  await page.getByLabel("گذرواژه").fill("nikyar123")
  await page.getByRole("button", { name: "ورود" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "پیشخوان" })).toBeVisible()
  await page.context().storageState({ path: "e2e/.auth/admin.json" })
})
