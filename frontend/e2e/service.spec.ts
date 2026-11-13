import { expect, test } from "@playwright/test"
import { expectAccessible } from "./helpers"

// دوران خدمت ۲ (5.8b): پایان قرارداد در پرونده (ویرایش منابع انسانی) و تنظیم یادآوری آن.
test("پایان قرارداد در پرونده و تنظیمات دوران خدمت", async ({ page }, info) => {
  await page.goto("/admin/settings?section=hr-service")
  await expect(page.getByRole("region", { name: "منابع انسانی: دوران خدمت" }).getByLabel("یادآوری پیش از پایان قرارداد", { exact: true })).toHaveValue("30")
  await expectAccessible(page)
  test.skip(info.project.name !== "desktop")
  await page.goto("/hr/employees")
  await page.getByRole("main").getByText("نوری").first().click()
  await page.getByRole("button", { name: "ویرایش پرونده" }).click()
  const sheet = page.getByRole("dialog")
  await sheet.getByLabel("پایان قرارداد", { exact: true }).fill("14061229")
  await sheet.getByRole("button", { name: "ذخیره" }).click()
  await expect(page.getByText(/تغییرات پرونده‌ی .* ذخیره شد/)).toBeVisible()
  await page.getByRole("tab", { name: "استخدام" }).click()
  await expect(page.getByRole("tabpanel")).toContainText("پایان قرارداد۱۴۰۶/۱۲/۲۹")
})
