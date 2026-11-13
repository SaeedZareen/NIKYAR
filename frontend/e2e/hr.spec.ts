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
    // تاریخ تولد از فهرست سال‌های تقویم (۱۳۰۰ تا ۳۰ سال آینده، نه فقط ۱۵ سال پیرامون امسال)
    await sheet.getByRole("button", { name: "انتخاب از تقویم" }).first().click()
    const calendar = page.locator("[data-slot=popover-content]")
    await calendar.getByRole("button", { name: "۱۴۰۵", exact: true }).click()
    while (!(await calendar.getByRole("option", { name: "۱۳۷۶", exact: true }).count())) await calendar.getByRole("button", { name: "صفحه قبل" }).click()
    await calendar.getByRole("option", { name: "۱۳۷۶", exact: true }).click()
    await calendar.getByRole("option", { name: "آبان", exact: true }).click()
    await calendar.getByRole("gridcell", { name: "۱۳۷۶/۰۸/۱۰" }).click()
    await expect(sheet.getByLabel("تاریخ تولد", { exact: true })).toHaveValue("1376/08/10")
    await sheet.getByLabel("تاریخ استخدام", { exact: true }).fill("14030115")
    await choose(page, "نوع استخدام", "قراردادی")
    await expectAccessible(page)
    await sheet.getByRole("button", { name: "ذخیره" }).click()

    await expect(page.getByRole("heading", { level: 1, name: `نرگس ${last}` })).toBeVisible()
    await expect(page.getByText(/^کد پرسنلی [۰-۹]{5}$/)).toBeVisible()
    await expect(page.getByRole("region", { name: "مشخصات فردی" })).toContainText(code.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]))
    await page.getByRole("tab", { name: "استخدام" }).click()
    await expect(page.getByRole("region", { name: "استخدام" })).toContainText("قراردادی")
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

  test("سوابق پرونده: تحصیلات، حساب بانکی با نام بانک و مدرک منقضی", async ({ page }, info) => {
    const errors = collectErrors(page)
    // پرونده‌ی نمونه‌ی «حسین نوری» برای هر اندازه جدا نیست، پس سوابق با داده‌ی یکتای هر اندازه افزوده می‌شوند
    const field = `حسابداری ${info.project.name} ${Date.now().toString().slice(-5)}`
    await page.goto("/hr/employees")
    await page.getByRole("main").getByText("حسین نوری").first().click()
    await expect(page.getByRole("heading", { level: 1, name: "حسین نوری" })).toBeVisible()

    await page.getByRole("tab", { name: "تحصیلات و سوابق کاری" }).click()
    const education = page.getByRole("region", { name: "تحصیلات" })
    await education.getByRole("button", { name: "افزودن سابقه‌ی تحصیلی" }).click()
    let sheet = page.getByRole("dialog", { name: "افزودن سابقه‌ی تحصیلی" })
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByText("تکمیل «مقطع» الزامی است.").first()).toBeVisible()
    await choose(page, "مقطع", "کارشناسی")
    await sheet.getByLabel("رشته", { exact: true }).fill(field)
    await sheet.getByLabel("سال دانش‌آموختگی", { exact: true }).fill("1398")
    await sheet.getByLabel("معدل", { exact: true }).fill("21")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByText("«معدل» باید عدد تا ۲۰ باشد.").first()).toBeVisible()
    await sheet.getByLabel("معدل", { exact: true }).fill("17.25")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText("سابقه‌ی تحصیلی افزوده شد.")).toBeVisible()
    await expect(education).toContainText(field)

    await page.getByRole("tab", { name: "بانک و بیمه" }).click()
    const banks = page.getByRole("region", { name: "حساب‌های بانکی" })
    await banks.getByRole("button", { name: "افزودن حساب بانکی" }).click()
    sheet = page.getByRole("dialog", { name: "افزودن حساب بانکی" })
    await sheet.getByLabel("شماره‌ی شبا", { exact: true }).fill("160120000000001234567890")
    await expect(sheet.getByText("بانک ملت")).toBeVisible()
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText("حساب بانکی افزوده شد.")).toBeVisible()
    await expect(banks).toContainText("ملت")

    await page.getByRole("tab", { name: "مدارک" }).click()
    const documents = page.getByRole("region", { name: "مدارک" })
    await documents.getByRole("button", { name: "افزودن مدرک" }).click()
    sheet = page.getByRole("dialog", { name: "افزودن مدرک" })
    await choose(page, "نوع مدرک", "گواهی سلامت")
    await sheet.getByLabel("تاریخ اعتبار", { exact: true }).fill("14000101")
    await sheet.getByLabel("توضیح", { exact: true }).fill(field)
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(documents).toContainText("منقضی")
    await expectAccessible(page)
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
    await page.getByRole("tab", { name: "استخدام" }).click()
    await expect(page.getByRole("region", { name: "سمت‌های جاری" })).toContainText("حسابدار")
    // مدیر واحد سوابق تحصیلی را می‌بیند ولی حساب بانکی و بیمه را نه
    await expect(page.getByRole("tab", { name: "بانک و بیمه" })).toHaveCount(0)
    await page.getByRole("tab", { name: "تحصیلات و سوابق کاری" }).click()
    await expect(page.getByRole("region", { name: "تحصیلات" })).toBeVisible()
    await expect(page.getByRole("button", { name: /افزودن/ })).toHaveCount(0)
    await expectAccessible(page)
    expect(errors).toEqual([])
    await page.context().close()
  })
})
