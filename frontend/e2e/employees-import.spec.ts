import { expect, test } from "@playwright/test"
import { collectErrors, expectAccessible } from "./helpers"

// ورود و خروج گروهی (5.9): فایل CSV، نگاشت خودکار سرستون‌ها، پیش‌نمایش با خطای هر ردیف و ثبت ردیف‌های درست.

/** کد ملی معتبر از ۹ رقم نخست (رقم کنترل). */
function nationalCode(nine: string) {
  const sum = [...nine].reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11
  return nine + String(sum < 2 ? sum : 11 - sum)
}

test("ورود پرونده‌ها از فایل با پیش‌نمایش و ثبت ردیف‌های درست", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop")
  const errors = collectErrors(page)
  const code = nationalCode(`00${String(Date.now()).slice(-7)}`)
  const csv = ["کد ملی,نام,نام خانوادگی,جنسیت,تاریخ استخدام,نوع استخدام", `${code},پریسا,واردشده,زن,1404/02/01,قراردادی`, "1234567890,نادرست,کد,مرد,1404/02/01,قراردادی"].join("\n")

  await page.goto("/hr/employees")
  await page.getByRole("link", { name: "ورود از اکسل" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "ورود پرونده‌ها از اکسل" })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({ name: "staff.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") })
  const mapping = page.getByRole("region", { name: "نگاشت ستون‌ها" })
  await expect(mapping).toContainText("۲ ردیف")
  await expect(mapping.getByRole("combobox", { name: "کد ملی" })).toHaveText("کد ملی")
  await mapping.getByRole("button", { name: "پیش‌نمایش" }).click()
  const preview = page.getByRole("region", { name: "پیش‌نمایش" })
  await expect(preview).toContainText("۱ تازه، ۰ به‌روزرسانی، ۱ خطا")
  await expect(preview).toContainText("کد ملی معتبر نیست")
  await expectAccessible(page)
  await preview.getByRole("button", { name: "ثبت ۱ ردیف درست" }).click()
  await expect(page.getByText("۱ پرونده‌ی تازه ساخته و ۰ پرونده به‌روز شد.")).toBeVisible()
  await expect(page).toHaveURL(/\/hr\/employees$/)
  await expect(page.getByRole("main").getByText("پریسا واردشده").first()).toBeVisible()
  expect(errors).toEqual([])
})
