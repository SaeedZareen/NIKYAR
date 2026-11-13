import { expect, test, type Page } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

// بخش‌های 5.4a: «سامانه و امنیت» و دو بخش منابع انسانی. تنظیمات سراسری‌اند؛ ذخیره فقط در اندازه‌ی desktop.
const uid = () => Math.random().toString(36).slice(2, 7)
const rows = (page: Page) => (isMobile(page) ? page.getByRole("list", { name: "فهرست ردیف‌ها" }).getByRole("listitem") : page.locator("tbody tr"))

test.describe("تنظیمات سامانه و منابع انسانی", () => {
  test("سامانه و امنیت: مقدار پیش‌فرض، بازه‌ی مجاز و ذخیره", async ({ page }, info) => {
    await page.goto("/admin/settings?section=system")
    const system = page.getByRole("region", { name: "سامانه و امنیت" })
    const days = system.getByLabel("اعتبار پیوند تأیید سریع", { exact: true })
    await expect(days).toHaveValue("3")
    await expect(system.getByLabel("مدت اعتبار ورود", { exact: true })).toHaveValue("10")
    await days.fill("45")
    await system.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(days).toHaveAccessibleDescription(/بین ۱ تا ۳۰ روز./)
    await expectAccessible(page)
    if (info.project.name !== "desktop") return

    await days.fill("5")
    await system.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("تنظیمات سامانه و امنیت ذخیره شد.")).toBeVisible()
    await page.reload()
    await expect(days).toHaveValue("5")
    await days.fill("3")
    await system.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(system.getByRole("button", { name: "ذخیره‌ی تغییرات" })).toBeDisabled()
  })

  test("منابع انسانی: نقش‌ها و سقف مبلغ", async ({ page }, info) => {
    await page.goto("/admin/settings?section=hr-roles")
    const roles = page.getByRole("region", { name: "منابع انسانی: نقش‌ها و سقف مبلغ" })
    await expect(roles.getByLabel("سقف مبلغ بی نیاز به تأیید مدیرعامل", { exact: true })).toHaveValue("1,000,000,000")
    await expect(roles.getByRole("combobox", { name: "امور مالی" })).toHaveText("تعیین نشده")
    await expectAccessible(page)
    if (info.project.name !== "desktop") return

    await roles.getByRole("combobox", { name: "کارشناس منابع انسانی" }).click()
    const option = page.getByRole("option").nth(1)
    const name = (await option.textContent()) ?? ""
    await option.click()
    await roles.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("نقش‌ها و سقف مبلغ منابع انسانی ذخیره شد.")).toBeVisible()
    await page.reload()
    await expect(roles.getByRole("combobox", { name: "کارشناس منابع انسانی" })).toHaveText(name)
  })

  test("منابع انسانی: سهمیه‌ی مرخصی و نوع‌های مرخصی", async ({ page }, info) => {
    await page.goto("/admin/settings?section=hr-leave")
    const quota = page.getByRole("region", { name: "منابع انسانی: مرخصی و تردد" })
    await expect(quota.getByLabel("مرخصی استحقاقی سالانه", { exact: true })).toHaveValue("26")
    // سهمیه‌ی هر نوع استخدام خالی است و مقدار عمومی را نشان می‌دهد
    await expect(quota.getByLabel("ساعتی و پاره‌وقت", { exact: true })).toHaveAttribute("placeholder", "۲۶")
    const types = page.getByRole("region", { name: "نوع‌های مرخصی" })
    await expect(rows(page).filter({ hasText: "زایمان" })).toContainText("۲۷۰ روز")
    await expectAccessible(page)
    if (info.project.name !== "desktop") return

    // نوع تازه با پیوست بالای دو روز؛ سپس ویرایش و حذف
    const title = `مرخصی آزمون ${uid()}`
    await types.getByRole("button", { name: "افزودن نوع مرخصی" }).click()
    const sheet = page.getByRole("dialog", { name: "افزودن نوع مرخصی" })
    await sheet.getByLabel("عنوان", { exact: true }).fill(title)
    await sheet.getByLabel("سقف هر درخواست", { exact: true }).fill("2")
    await sheet.getByRole("combobox", { name: "پیوست (مثل گواهی پزشک)" }).click()
    await page.getByRole("option", { name: "برای بیش از چند روز" }).click()
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByRole("alert").first()).toContainText("شمار روزها را وارد کنید.")
    await sheet.getByLabel("پیوست لازم برای بیش از", { exact: true }).fill("1")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText("نوع مرخصی افزوده شد.")).toBeVisible()
    const row = rows(page).filter({ hasText: title })
    await expect(row).toContainText("بیش از ۱ روز")

    await row.getByRole("button", { name: "عملیات ردیف" }).click()
    await page.getByRole("menuitem", { name: "ویرایش" }).click()
    await page.getByRole("dialog").getByLabel("فعال", { exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "ذخیره" }).click()
    await expect(row).toContainText("خاموش")

    await row.getByRole("button", { name: "عملیات ردیف" }).click()
    await page.getByRole("menuitem", { name: "حذف" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click()
    await expect(rows(page).filter({ hasText: title })).toHaveCount(0)

    // نوع پایه حذف نمی‌شود
    await rows(page).filter({ hasText: "استعلاجی" }).getByRole("button", { name: "عملیات ردیف" }).click()
    await expect(page.getByRole("menuitem", { name: "حذف" })).toHaveCount(0)
    await page.keyboard.press("Escape")
  })
})
