import { expect, test } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

const uid = () => Math.random().toString(36).slice(2, 7)

test.describe("تنظیمات", () => {
  test("اعتبارسنجی مشخصات سازمان و هشدار تغییرهای ذخیره‌نشده", async ({ page }) => {
    await page.goto("/admin/settings")
    const profile = page.getByRole("region", { name: "مشخصات سازمان" })
    await expect(profile.getByLabel("نام کامل سازمان", { exact: true })).not.toHaveValue("")
    await expect(profile.getByRole("button", { name: "ذخیره‌ی تغییرات" })).toBeDisabled()

    await profile.getByLabel("شناسه‌ی ملی", { exact: true }).fill("۱۰۱۰۰۳۸۷۲۲۲")
    await profile.getByLabel("تلفن", { exact: true }).fill("88000000")
    await profile.getByLabel("وب‌سایت", { exact: true }).fill("example")
    // خطاهای هر فیلد با ترک آن ظاهر می‌شوند؛ پس از جابه‌جایی چیدمان، دکمه‌ی ذخیره زده می‌شود.
    await profile.getByLabel("وب‌سایت", { exact: true }).blur()
    await profile.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toBeFocused()
    await expect(summary).toContainText("شناسه‌ی ملی معتبر نیست")
    await expect(summary).toContainText("پیش‌شماره‌ی شهر")
    await expect(summary).toContainText("نشانی وب‌سایت")
    await expectAccessible(page)

    // رفتن به بخش دیگر با تغییرهای ذخیره‌نشده پرسش می‌خواهد.
    await page.getByRole("navigation", { name: "بخش‌های تنظیمات" }).getByRole("button", { name: "سال مالی" }).click()
    const dialog = page.getByRole("alertdialog", { name: "تغییرها ذخیره نشده‌اند" })
    await dialog.getByRole("button", { name: "انصراف" }).click()
    await expect(profile.getByLabel("تلفن", { exact: true })).toHaveValue("88000000")
    await page.getByRole("navigation", { name: "بخش‌های تنظیمات" }).getByRole("button", { name: "سال مالی" }).click()
    await dialog.getByRole("button", { name: "خروج بدون ذخیره" }).click()
    await expect(page).toHaveURL(/section=fiscal-year/)
    await expect(page.getByRole("region", { name: "سال مالی" })).toBeVisible()
  })

  test("راهنمای فیلد جمع‌شده (ⓘ) با زدن باز می‌شود و صفحه‌خوان آن را همراه فیلد می‌خواند", async ({ page }) => {
    await page.goto("/admin/settings")
    const profile = page.getByRole("region", { name: "مشخصات سازمان" })
    const help = "در نوار بالای سامانه؛ اگر خالی بماند، نام کامل نمایش داده می‌شود."
    await expect(profile.getByLabel("نام کوتاه", { exact: true })).toHaveAccessibleDescription(help)
    await expect(page.getByRole("dialog").filter({ hasText: help })).toHaveCount(0)
    await profile.getByRole("button", { name: "راهنمای نام کوتاه" }).click()
    await expect(page.getByRole("dialog").filter({ hasText: help })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog").filter({ hasText: help })).toHaveCount(0)
  })

  test("پیش‌نمایش دوره‌ی مالی با تغییر ماه آغاز", async ({ page }) => {
    await page.goto("/admin/settings?section=fiscal-year")
    const fiscal = page.getByRole("region", { name: "سال مالی" })
    await fiscal.getByRole("combobox", { name: "ماه آغاز سال مالی" }).click()
    await page.getByRole("option", { name: "تیر" }).click()
    await expect(fiscal).toContainText(/دوره‌ی مالی جاری: از ۱ تیر ۱۴\S+ تا ۳۱ خرداد ۱۴\S+/)
    await fiscal.getByRole("button", { name: "بازگردانی" }).click()
    await expect(fiscal).toContainText(/از ۱ فروردین ۱۴\S+ تا ۲\S اسفند/)
    await expectAccessible(page)
  })

  test("نام سازمان پس از ذخیره در نوار بالا و صفحه‌ی ورود دیده می‌شود", async ({ page, browser }, testInfo) => {
    // مشخصات سازمان یک مقدار سراسری است؛ فقط در یک اندازه تغییر داده می‌شود تا آزمون‌های هم‌زمان تداخل نکنند.
    test.skip(testInfo.project.name !== "desktop" || isMobile(page))
    const name = `شرکت آزمون ${uid()}`
    await page.goto("/admin/settings")
    const profile = page.getByRole("region", { name: "مشخصات سازمان" })
    await profile.getByLabel("نام کامل سازمان", { exact: true }).fill(name)
    await profile.getByLabel("نام کوتاه", { exact: true }).fill("")
    await profile.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("مشخصات سازمان ذخیره شد.")).toBeVisible()
    await expect(profile.getByRole("button", { name: "ذخیره‌ی تغییرات" })).toBeDisabled()
    await expect(page.getByRole("banner")).toContainText(name)

    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const login = await anonymous.newPage()
    await login.goto("/login")
    await expect(login.getByText(name)).toBeVisible()
    await anonymous.close()
  })

  test("کاربر بدون مجوز تنظیمات را در منو نمی‌بیند", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto("/login")
    await page.getByLabel("نام کاربری", { exact: true }).fill("hr_expert")
    await page.getByLabel("گذرواژه", { exact: true }).fill("nikyar123")
    await page.getByRole("button", { name: "ورود" }).click()
    await expect(page.getByText("خوش آمدید", { exact: false })).toBeVisible()
    await expect(page.getByRole("link", { name: "تنظیمات" })).toHaveCount(0)
    await page.goto("/admin/settings")
    await expect(page.getByRole("heading", { level: 1, name: "دسترسی ندارید" })).toBeVisible()
    await context.close()
  })
})
