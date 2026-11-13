import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { collectErrors, expectAccessible, isMobile } from "./helpers"

/** کد ملی معتبر تازه برای هر آزمون (پروژه‌ها هم‌زمان روی یک سرورند). */
function nationalCode() {
  const body = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("")
  const rem = [...body].reduce((sum, d, i) => sum + Number(d) * (10 - i), 0) % 11
  return body + String(rem < 2 ? rem : 11 - rem)
}

async function signIn(browser: Browser, info: TestInfo, username: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, ...(info.project.use.viewport ? { viewport: info.project.use.viewport } : {}) })
  const page = await context.newPage()
  await page.goto("/login")
  await page.getByLabel("نام کاربری", { exact: true }).fill(username)
  await page.getByLabel("گذرواژه", { exact: true }).fill("nikyar123")
  await page.getByRole("button", { name: "ورود" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "پیشخوان" })).toBeVisible()
  return page
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

test.describe("پرونده‌ی پرسنلی", () => {
  test("پرونده‌ی تازه با کد پرسنلی، زبانه‌ها و پایان همکاری", async ({ page }, info) => {
    const errors = collectErrors(page)
    const last = `آزمون ${info.project.name} ${Date.now().toString().slice(-6)}`
    const code = nationalCode()
    await page.goto("/hr/employees")
    await expect(page.getByRole("heading", { level: 1, name: "پرونده‌های پرسنلی" })).toBeVisible()
    await expectAccessible(page)

    await page.getByRole("button", { name: "پرونده‌ی تازه" }).click()
    const sheet = page.getByRole("dialog", { name: "پرونده‌ی تازه" })
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByText("تکمیل «نام» الزامی است.").first()).toBeVisible()
    await sheet.getByLabel("نام", { exact: true }).fill("نرگس")
    await sheet.getByLabel("نام خانوادگی", { exact: true }).fill(last)
    await sheet.getByLabel("کد ملی", { exact: true }).fill(code)
    await choose(page, "جنسیت", "زن")
    await sheet.getByLabel("تاریخ استخدام", { exact: true }).fill("14030115")
    await choose(page, "نوع استخدام", "قراردادی")
    await expectAccessible(page)
    await sheet.getByRole("button", { name: "ذخیره" }).click()

    await expect(page.getByRole("heading", { level: 1, name: `نرگس ${last}` })).toBeVisible()
    await expect(page.getByText(/^کد پرسنلی [۰-۹]{5}$/)).toBeVisible()
    await expect(page.getByRole("region", { name: "مشخصات فردی" })).toContainText(code.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]))
    await page.getByRole("tab", { name: "استخدام" }).click()
    await expect(page.getByRole("region", { name: "استخدام" })).toContainText("قراردادی")
    await page.getByRole("tab", { name: "سمت‌ها" }).click()
    await expect(page.getByText("این پرونده به کاربر سامانه وصل نیست")).toBeVisible()
    await expectAccessible(page)

    // پایان همکاری بی تاریخ پذیرفته نیست
    await page.getByRole("button", { name: "ویرایش پرونده" }).click()
    const edit = page.getByRole("dialog", { name: new RegExp("ویرایش پرونده") })
    await choose(page, "وضعیت", "پایان همکاری")
    await edit.getByRole("button", { name: "ذخیره" }).click()
    await expect(edit.getByText("تاریخ پایان همکاری را وارد کنید.").first()).toBeVisible()
    await edit.getByLabel("تاریخ پایان همکاری", { exact: true }).fill("14040601")
    await choose(page, "علت پایان همکاری", "استعفا")
    await edit.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText("تغییرات پرونده‌ی «نرگس")).toBeVisible()
    await page.getByRole("tab", { name: "استخدام" }).click()
    await expect(page.getByRole("region", { name: "استخدام" })).toContainText("استعفا")

    await page.goto("/hr/employees")
    const list = page.getByRole("main")
    if (isMobile(page)) await expect(list.getByRole("listitem").filter({ hasText: last })).toContainText("پایان همکاری")
    else await expect(list.getByRole("row").filter({ hasText: last })).toContainText("پایان همکاری")
    expect(errors).toEqual([])
  })

  test("مدیر واحد کارکنان واحد خود را فقط می‌بیند", async ({ browser }, info) => {
    const page = await signIn(browser, info, "fin_manager")
    const errors = collectErrors(page)
    // پیوند منو و دسترسی سریع پیشخوان هر دو هستند؛ دسترسی سریع در همه‌ی اندازه‌ها دیده می‌شود
    await page.getByRole("main").getByRole("link", { name: "پرونده‌های پرسنلی" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "پرونده‌های پرسنلی" })).toBeVisible()
    await expect(page.getByRole("button", { name: "پرونده‌ی تازه" })).toHaveCount(0)
    await expect(page.getByText("زهرا موسوی").first()).toBeVisible()
    await expect(page.getByText("علی رضایی")).toHaveCount(0)
    await page.getByText("زهرا موسوی").first().click()
    await expect(page.getByRole("heading", { level: 1, name: "زهرا موسوی" })).toBeVisible()
    await expect(page.getByRole("button", { name: "ویرایش پرونده" })).toHaveCount(0)
    await page.getByRole("tab", { name: "سمت‌ها" }).click()
    await expect(page.getByRole("tabpanel")).toContainText("حسابدار")
    await expectAccessible(page)
    expect(errors).toEqual([])
    await page.context().close()
  })
})
