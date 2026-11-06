import { expect, test } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

test.describe("شماره‌گذاری اسناد", () => {
  test("ویرایش الگو با نشانه‌ها، پیش‌نمایش زنده و پیام خطای الگو", async ({ page }, info) => {
    await page.goto("/admin/settings?section=numbering")
    const section = page.getByRole("region", { name: "شماره‌گذاری اسناد" })
    const row = isMobile(page) ? section.getByRole("listitem").filter({ hasText: "سند نمونه" }) : section.locator("tbody tr").filter({ hasText: "سند نمونه" })
    await row.getByRole("button", { name: "عملیات ردیف" }).click()
    await page.getByRole("menuitem", { name: "ویرایش الگو" }).click()

    const sheet = page.getByRole("dialog")
    const pattern = sheet.getByLabel("الگوی شماره", { exact: true })
    await pattern.fill("نامه-")
    await sheet.getByRole("button", { name: "سال", exact: true }).click()
    await pattern.press("End")
    await pattern.pressSequentially("/")
    await expect(sheet).toContainText("الگو باید دقیقاً یک شمارنده")
    await sheet.getByRole("button", { name: "شمارنده" }).click()
    await expect(pattern).toHaveValue("نامه-{year}/{seq:5}")
    await expect(sheet).toContainText(/شماره‌ی بعدی: نامه-۱۴\S\S\/\S{5}/)

    await sheet.getByRole("combobox", { name: "شروع دوباره" }).click()
    await page.getByRole("option", { name: "آغاز هر سال مالی" }).click()
    await expect(sheet).toContainText("باید {fyear} داشته باشد")
    await sheet.getByRole("combobox", { name: "شروع دوباره" }).click()
    await page.getByRole("option", { name: "آغاز هر سال شمسی" }).click()
    await expectAccessible(page)

    // الگو سراسری است؛ ذخیره فقط در یک اندازه
    if (info.project.name !== "desktop") return
    await sheet.getByLabel("شماره‌ی بعدی", { exact: true }).fill("500")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText(/الگوی «سند نمونه \(کیت رابط کاربری\)» ذخیره شد؛ شماره‌ی بعدی: نامه-۱۴\S\S\/۰۰۵۰۰/)).toBeVisible()
  })

  test("درخواست‌های هم‌زمان شماره‌ی تکراری نمی‌گیرند", async ({ page }) => {
    await page.goto("/ui-kit/components")
    const numbers = await page.evaluate(async () => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const issue = () =>
        fetch("/api/numbering/sequences/sample/issue/", { method: "POST", headers: { "X-CSRFToken": token } }).then((r) => r.json() as Promise<{ number: string }>)
      return (await Promise.all(Array.from({ length: 30 }, issue))).map((r) => r.number)
    })
    expect(new Set(numbers).size).toBe(30)

    const demo = page.getByRole("region", { name: "شماره‌گذاری اسناد" })
    await demo.getByRole("button", { name: "صدور شماره‌ی نمونه" }).click()
    await expect(demo.getByRole("list", { name: "شماره‌های صادرشده" }).getByRole("listitem")).toHaveCount(1)
  })
})
