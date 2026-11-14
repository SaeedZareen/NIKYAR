import { expect, test } from "@playwright/test"
import { expectAccessible } from "./helpers"

// سلامت سامانه (6.4): بررسی‌ها، به‌روزرسانی‌ها و خطاها؛ مرز هشدار در «تنظیمات › پایش و هشدار» (سراسری؛ ذخیره فقط در desktop).
test("سلامت سامانه و مرزهای هشدار", async ({ page }, info) => {
  await page.goto("/admin/health")
  await expect(page.getByRole("heading", { level: 1, name: "سلامت سامانه" })).toBeVisible()
  const status = page.getByRole("region", { name: "وضعیت" })
  for (const title of ["فضای دیسک", "پشتیبان‌گیری", "خطاهای سامانه", "اعتبار لایسنس", "به‌روزرسانی"]) await expect(status).toContainText(title)
  await expect(status).toContainText("گیگابایت خالی از")
  await expect(page.getByRole("region", { name: "به‌روزرسانی‌ها" })).toContainText("از زمان نصب، به‌روزرسانی امن انجام نشده است")
  await expect(page.getByRole("region", { name: "خطاهای ۲۴ ساعت گذشته" })).toBeVisible()
  await expectAccessible(page)

  test.skip(info.project.name !== "desktop")
  await page.getByRole("link", { name: "مرزهای هشدار" }).click()
  const section = page.getByRole("region", { name: "پایش و هشدار" })
  const disk = section.getByLabel("کمترین فضای خالی دیسک", { exact: true })
  await expect(disk).toHaveValue("5")
  await disk.fill("9999")
  await section.getByRole("button", { name: "ذخیره" }).click()
  await expect(page.getByText("تنظیمات پایش و هشدار ذخیره شد.")).toBeVisible()
  try {
    await page.goto("/admin/health")
    const card = page.getByRole("region", { name: "وضعیت" }).getByRole("listitem").filter({ hasText: "فضای دیسک" })
    await expect(card).toContainText("نیاز به توجه")
    await expect(card).toContainText("فضای خالی دیسک سرور")
    await expect(page.getByRole("region", { name: "وضعیت" })).toContainText("مورد نیاز به توجه")
  } finally {
    await page.goto("/admin/settings?section=monitoring")
    await page.getByLabel("کمترین فضای خالی دیسک", { exact: true }).fill("5")
    await page.getByRole("region", { name: "پایش و هشدار" }).getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText("تنظیمات پایش و هشدار ذخیره شد.")).toBeVisible()
  }
})

test("کاربر بدون مجوز صفحه‌ی سلامت سامانه را نمی‌بیند", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto("/login")
  await page.getByLabel("نام کاربری", { exact: true }).fill("accountant")
  await page.getByLabel("گذرواژه", { exact: true }).fill("nikyar123")
  await page.getByRole("button", { name: "ورود" }).click()
  await expect(page.getByText("خوش آمدید", { exact: false })).toBeVisible()
  await page.goto("/admin/health")
  await expect(page.getByRole("heading", { level: 1, name: "دسترسی ندارید" })).toBeVisible()
  await context.close()
})
