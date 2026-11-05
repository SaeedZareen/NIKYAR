import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { isMobile } from "./helpers"

const rows = (page: Page) => (isMobile(page) ? page.getByRole("list", { name: "فهرست ردیف‌ها" }).getByRole("listitem") : page.locator("tbody tr"))
const summary = (page: Page) => page.getByText(/^نمایش .* از /)

test.describe("جدول داده", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ui-kit/data-table")
    await expect(rows(page).first()).toBeVisible()
  })

  test("صفحه‌بندی، تعداد در صفحه و نشانی صفحه", async ({ page }) => {
    await expect(summary(page)).toHaveText("نمایش ۱ تا ۲۵ از ۲۴۰")
    await expect(rows(page)).toHaveCount(25)
    await page.getByRole("button", { name: "صفحه‌ی بعد" }).click()
    await expect(summary(page)).toHaveText("نمایش ۲۶ تا ۵۰ از ۲۴۰")
    await expect(page).toHaveURL(/page=2/)
    await page.getByRole("combobox", { name: "تعداد در صفحه" }).click()
    await page.getByRole("option", { name: "۵۰" }).click()
    await expect(rows(page)).toHaveCount(50)
    await expect(page).toHaveURL(/size=50/)
  })

  test("جست‌وجو با ارقام فارسی و پاک‌کردن فیلتر", async ({ page }) => {
    await page.getByRole("searchbox").fill("۱۰۰۷")
    await expect(rows(page)).toHaveCount(1)
    await expect(page).toHaveURL(/q=1007/)
    await page.getByRole("button", { name: "پاک‌کردن فیلترها" }).first().click()
    await expect(rows(page)).toHaveCount(25)
  })

  test("فیلتر چندانتخابی با شمارش، و حفظ در نشانی", async ({ page }) => {
    await page.getByRole("button", { name: "وضعیت", exact: true }).click()
    await page.getByRole("option", { name: /قطع همکاری/ }).click()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/f\.status=terminated/)
    await expect(summary(page)).not.toHaveText("نمایش ۱ تا ۲۵ از ۲۴۰")
    const count = await rows(page).count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(25)
    await page.reload()
    await expect(rows(page)).toHaveCount(count)
  })

  test("مرتب‌سازی از منوی ستون", async ({ page }) => {
    test.skip(isMobile(page), "سرستون روی موبایل نیست")
    await page.getByRole("button", { name: "گزینه‌های ستون کد پرسنلی" }).click()
    await page.getByRole("menuitem", { name: "مرتب‌سازی نزولی" }).click()
    await expect(page).toHaveURL(/sort=-code/)
    await expect(page.locator("tbody tr").first().locator("td").nth(1)).toHaveText("۱۲۴۰")
    await expect(page.getByRole("columnheader", { name: /کد پرسنلی/ })).toHaveAttribute("aria-sort", "descending")
  })

  test("انتخاب ردیف‌ها با Shift و عملیات گروهی", async ({ page }) => {
    test.skip(isMobile(page), "انتخاب بازه‌ای مخصوص صفحه‌کلید و موشواره است")
    const boxes = page.locator("tbody").getByRole("checkbox", { name: "انتخاب ردیف" })
    await boxes.nth(0).click()
    await boxes.nth(4).click({ modifiers: ["Shift"] })
    const bar = page.getByRole("region", { name: "عملیات گروهی" })
    await expect(bar).toContainText("۵ ردیف انتخاب‌شده")
    await bar.getByRole("button", { name: "علامت‌گذاری برای بررسی" }).click()
    await expect(page.getByText("۵ ردیف برای بررسی علامت خورد.")).toBeVisible()
    await expect(bar).toBeHidden()
  })

  test("پنهان‌کردن ستون پس از بارگذاری دوباره حفظ می‌شود", async ({ page }) => {
    test.skip(isMobile(page), "سرستون روی موبایل نیست")
    await page.getByRole("button", { name: "تنظیم نمای جدول" }).click()
    await page.getByRole("menuitemcheckbox", { name: "کد ملی" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("columnheader", { name: /کد ملی/ })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("columnheader", { name: /کد ملی/ })).toHaveCount(0)
    await page.getByRole("button", { name: "تنظیم نمای جدول" }).click()
    await page.getByRole("menuitem", { name: "بازگشت به نمای پیش‌فرض" }).click()
    await expect(page.getByRole("columnheader", { name: /کد ملی/ })).toHaveCount(1)
  })

  test("خروجی اکسل با سرستون فارسی", async ({ page }) => {
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "خروجی اکسل" }).click()
    const file = readFileSync(await (await download).path(), "utf-8")
    expect(file.charCodeAt(0)).toBe(0xfeff)
    const lines = file.slice(1).split("\r\n")
    expect(lines[0]).toContain("نام و نام خانوادگی")
    expect(lines[0]).not.toContain("عملیات")
    expect(lines).toHaveLength(241)
  })

  test("پیوند ردیف به صفحه‌ی جزئیات", async ({ page }) => {
    await rows(page).first().getByRole("link").click()
    await expect(page).toHaveURL(/\/ui-kit\/data-table\/\d+$/)
    await expect(page.getByRole("heading", { level: 2, name: "مشخصات" })).toBeVisible()
    await page.getByRole("link", { name: "جدول داده" }).first().click()
    await expect(page.getByRole("heading", { level: 1, name: "جدول داده" })).toBeVisible()
  })

  test("نتیجه‌ی خالی پیام و راه بازگشت دارد", async ({ page }) => {
    await page.getByRole("searchbox").fill("نامی که وجود ندارد")
    await expect(page.getByText("نتیجه‌ای پیدا نشد")).toBeVisible()
    await page.getByRole("button", { name: "پاک‌کردن فیلترها" }).last().click()
    await expect(rows(page)).toHaveCount(25)
  })
})
