import { expect, test } from "@playwright/test"
import { expectAccessible } from "./helpers"

test.describe("پیامک و ایمیل", () => {
  test("صفحه‌ی پیامک و ایمیل در همه‌ی اندازه‌ها", async ({ page }) => {
    await page.goto("/admin/settings?section=messaging")
    await expect(page.getByRole("region", { name: "گزارش ارسال‌ها" })).toBeVisible()
    await expectAccessible(page)
  })

  test("تنظیم درگاه، رمز پنهان، ارسال آزمایشی و گزارش ارسال‌ها", async ({ page }, info) => {
    // تنظیمات سراسری است؛ کل جریان فقط در یک اندازه
    test.skip(info.project.name !== "desktop")
    await page.goto("/admin/settings?section=messaging")
    const form = page.getByRole("region", { name: "پیامک و ایمیل" })
    await form.getByRole("combobox", { name: "درگاه پیامک" }).click()
    await page.getByRole("option", { name: "کاوه‌نگار" }).click()
    await form.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("کلید درگاه پیامک را وارد کنید.")
    await expect(summary).toContainText("شماره‌ی فرستنده را وارد کنید.")

    // فیلدهای حساب هر درگاه
    await form.getByRole("combobox", { name: "درگاه پیامک" }).click()
    await page.getByRole("option", { name: "مگفا" }).click()
    await expect(form.getByLabel("نام کاربری درگاه", { exact: true })).toBeVisible()
    await expect(form.getByLabel("دامنه‌ی حساب", { exact: true })).toBeVisible()
    await expect(form.getByLabel("گذرواژه‌ی حساب درگاه", { exact: true })).toBeVisible()
    await form.getByRole("combobox", { name: "درگاه پیامک" }).click()
    await page.getByRole("option", { name: "کاوه‌نگار" }).click()
    await expect(form.getByLabel("نام کاربری درگاه", { exact: true })).toHaveCount(0)
    await form.getByLabel("کلید درگاه پیامک", { exact: true }).fill("TEST-KEY")
    await form.getByLabel("شماره‌ی فرستنده", { exact: true }).fill("10008663")
    await form.getByRole("switch", { name: "ارسال ایمیل" }).click()
    await form.getByLabel("سرور SMTP", { exact: true }).fill("smtp.example.ir")
    await form.getByLabel("نشانی فرستنده", { exact: true }).fill("noreply@example.ir")
    await form.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("تنظیمات پیامک و ایمیل ذخیره شد.")).toBeVisible()
    await expect(form.getByLabel("کلید درگاه پیامک", { exact: true })).toHaveValue("••••••••")

    const tests = page.getByRole("region", { name: "ارسال آزمایشی" })
    await tests.getByRole("button", { name: "آزمون اتصال درگاه پیامک" }).click()
    await expect(tests.getByRole("status").filter({ hasText: "اتصال به درگاه برقرار است؛ اعتبار حساب: آزمایشی" })).toBeVisible()
    await tests.getByLabel("موبایل گیرنده").fill("09121112233")
    await tests.getByRole("button", { name: "پیامک آزمایشی" }).click()
    await expect(tests.getByRole("status").filter({ hasText: "پیامک آزمایشی به ۰۹۱۲۱۱۱۲۲۳۳ فرستاده شد." })).toBeVisible()
    await tests.getByLabel("ایمیل گیرنده").fill("owner@example.ir")
    await tests.getByRole("button", { name: "ایمیل آزمایشی" }).click()
    await expect(tests.getByRole("status").filter({ hasText: "ایمیل آزمایشی به owner@example.ir فرستاده شد." })).toBeVisible()

    const log = page.getByRole("region", { name: "گزارش ارسال‌ها" })
    await expect(log.locator("tbody tr").filter({ hasText: "ارسال شد" })).toHaveCount(2)
  })

  test("انتخاب کاربر برای دریافت اعلان با پیامک و ایمیل", async ({ page }) => {
    await page.goto("/notifications")
    await page.getByRole("link", { name: "دریافت با پیامک و ایمیل" }).click()
    await expect(page).toHaveURL(/\/account\?tab=notifications$/)
    const kinds = page.getByRole("region", { name: "دریافت اعلان با پیامک و ایمیل" }).getByRole("list", { name: "نوع‌های اعلان" })
    await expect(kinds).toContainText("تغییر گذرواژه")
    await expect(kinds.getByRole("switch", { name: "پیامک برای «تغییر گذرواژه»" })).toBeVisible()
    await expectAccessible(page)
  })

  test("پیامک الگویی برای یک نوع اعلان", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop")
    await page.goto("/admin/settings?section=notification-templates")
    const row = page.locator("tbody tr").filter({ hasText: "قفل شدن حساب" })
    await row.getByRole("button", { name: "عملیات ردیف" }).click()
    await page.getByRole("menuitem", { name: "ویرایش متن" }).click()
    const sheet = page.getByRole("dialog")
    await sheet.getByLabel("کد الگوی پیامک", { exact: true }).fill("123456")
    await sheet.getByRole("group", { name: "افزودن متغیر" }).getByRole("button", { name: "پایان قفل" }).click()
    await expect(sheet.getByLabel("متغیرهای الگو", { exact: true })).toHaveValue("{until}")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText("متن اعلان «قفل شدن حساب» ذخیره شد.")).toBeVisible()
    await expect(row).toContainText("پیامک الگویی")
    await expectAccessible(page)
  })
})
