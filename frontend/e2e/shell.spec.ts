import { expect, test } from "@playwright/test"
import { collectErrors, expectAccessible, isMobile } from "./helpers"

test.describe("پوسته‌ی برنامه", () => {
  test("اولین Tab به «پرش به محتوا» می‌رسد و صفحه بدون خطا بالا می‌آید", async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto("/")
    await expect(page).toHaveURL(/\/ui-kit\/data-table$/)
    await expect(page.getByRole("heading", { level: 1, name: "جدول داده" })).toBeVisible()
    await expect(page).toHaveTitle("جدول داده · نیک‌یار")
    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "پرش به محتوای اصلی" })).toBeFocused()
    expect(errors).toEqual([])
  })

  test("منوی کناری، زبانه‌های صفحه‌های باز و بستن زبانه", async ({ page }) => {
    test.skip(isMobile(page), "زبانه‌ها روی موبایل نمایش داده نمی‌شوند")
    await page.goto("/ui-kit/data-table")
    await expect(page.getByRole("heading", { level: 1, name: "جدول داده" })).toBeVisible()
    const sidebar = page.locator("[data-slot=sidebar]")
    await sidebar.getByRole("link", { name: "فرم‌ها" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "فرم‌ها" })).toBeVisible()
    const tabs = page.getByRole("navigation", { name: "صفحه‌های باز" })
    await expect(tabs.getByRole("button", { name: "جدول داده", exact: true })).toBeVisible()
    await expect(tabs.getByRole("button", { name: "فرم‌ها", exact: true })).toHaveAttribute("aria-current", "page")

    await tabs.getByRole("button", { name: "جدول داده", exact: true }).click()
    await expect(page).toHaveURL(/data-table$/)
    await tabs.getByRole("button", { name: "بستن زبانه‌ی فرم‌ها" }).click()
    await expect(tabs.getByRole("button", { name: "فرم‌ها", exact: true })).toHaveCount(0)
  })

  test("جست‌وجوی سراسری با Ctrl+K به بخش موردنظر می‌برد", async ({ page }) => {
    await page.goto("/ui-kit/data-table")
    await page.keyboard.press("Control+k")
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("combobox").fill("اجزای")
    await page.keyboard.press("Enter")
    await expect(page.getByRole("heading", { level: 1, name: "اجزای پایه" })).toBeVisible()
  })

  test("منوی موبایل باز و با انتخاب بخش بسته می‌شود", async ({ page }) => {
    test.skip(!isMobile(page), "فقط موبایل")
    await page.goto("/ui-kit/data-table")
    await page.getByRole("button", { name: "باز و بسته کردن منو" }).click()
    const menu = page.getByRole("dialog", { name: "منو" })
    await menu.getByRole("link", { name: "فرم‌ها" }).click()
    await expect(menu).toBeHidden()
    await expect(page.getByRole("heading", { level: 1, name: "فرم‌ها" })).toBeVisible()
  })

  test("پوسته‌ی تیره انتخاب و پس از بارگذاری دوباره حفظ می‌شود", async ({ page }) => {
    await page.goto("/ui-kit/components")
    await page.getByRole("button", { name: "انتخاب پوسته" }).click()
    await page.getByRole("menuitemradio", { name: "تیره" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expectAccessible(page)
  })

  test("صفحه‌ی ناموجود پیام روشن دارد", async ({ page }) => {
    await page.goto("/no-such-page")
    await expect(page.getByRole("heading", { level: 1, name: "صفحه پیدا نشد" })).toBeVisible()
  })

  test("هیچ صفحه‌ای اسکرول افقی ندارد", async ({ page }) => {
    for (const path of ["/ui-kit/data-table", "/ui-kit/forms", "/ui-kit/components"]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })
})

test.describe("دسترس‌پذیری", () => {
  for (const path of ["/ui-kit/data-table", "/ui-kit/data-table/1", "/ui-kit/forms", "/ui-kit/components"]) {
    test(`axe ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expectAccessible(page)
    })
  }
})
