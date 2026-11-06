import { expect, test } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

test.describe("پشتیبان‌گیری و کارهای سامانه", () => {
  test("پشتیبان‌گیری دستی و تأیید بازیابی با نوشتن نام سازمان", async ({ page }) => {
    await page.goto("/admin/backups")
    await expect(page.getByText(/پشتیبان خودکار: هر روز ساعت ۰۲:۰۰/)).toBeVisible()
    await page.getByRole("button", { name: "پشتیبان‌گیری اکنون" }).click()
    await expect(page.getByText(/پشتیبان کامل ساخته شد/)).toBeVisible()
    const rows = isMobile(page) ? page.getByRole("list", { name: "فهرست ردیف‌ها" }).getByRole("listitem") : page.locator("tbody tr")
    await expect(rows.filter({ hasText: "دستی" }).first()).toBeVisible()
    await expectAccessible(page)

    await rows.filter({ hasText: "دستی" }).first().getByRole("button", { name: "عملیات ردیف" }).click()
    await page.getByRole("menuitem", { name: "بازیابی" }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByRole("button", { name: "بازیابی" })).toBeDisabled()
    await dialog.getByRole("textbox").fill("نام اشتباه")
    await expect(dialog.getByRole("button", { name: "بازیابی" })).toBeDisabled()
    await dialog.getByRole("button", { name: "انصراف" }).click()
  })

  test("اجرای فوری یک کار دوره‌ای و دیدن نتیجه", async ({ page }) => {
    await page.goto("/admin/jobs")
    const periodic = page.getByRole("region", { name: "کارهای دوره‌ای" })
    await expect(periodic).toContainText("پشتیبان کامل روزانه")
    const row = isMobile(page)
      ? periodic.getByRole("listitem").filter({ hasText: "سابقه‌ی کارهای قدیمی" })
      : periodic.locator("tbody tr").filter({ hasText: "سابقه‌ی کارهای قدیمی" })
    await row.getByRole("button", { name: "اجرای اکنون" }).click()
    await expect(page.getByText("«پاک‌سازی سابقه‌ی کارهای قدیمی» در صف اجرا قرار گرفت.")).toBeVisible()
    await expect(page.getByText(/سابقه‌ی قدیمی‌تر از ۳۰ روز حذف شد/).first()).toBeVisible({ timeout: 15_000 })
    await expectAccessible(page)
  })

  test("تنظیمات پشتیبان‌گیری: اعتبارسنجی", async ({ page }) => {
    await page.goto("/admin/settings?section=backup")
    const section = page.getByRole("region", { name: "پشتیبان‌گیری خودکار" })
    await section.getByLabel("ساعت پشتیبان روزانه", { exact: true }).fill("2")
    await section.getByLabel("تعداد نسخه‌های نگهداری‌شده", { exact: true }).fill("0")
    await section.getByLabel("تعداد نسخه‌های نگهداری‌شده", { exact: true }).blur()
    await section.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("ساعت را به شکل ۰۲:۰۰ وارد کنید.")
    await expect(summary).toContainText("بین ۱ تا ۹۰ نسخه.")
  })
})
