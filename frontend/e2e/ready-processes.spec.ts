import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible, isMobile } from "./helpers"

// فرایندهای آماده (5.4b): فعال‌سازی، درخواست مرخصی ساعتی کارمند، تأیید مدیر و منابع انسانی، ثبت در پرونده.
// نصب فرایندها سراسری است؛ گردش کامل فقط در اندازه‌ی desktop، و بقیه فقط صفحه را می‌بینند.

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

async function openTask(page: Page, process: string) {
  const panel = page.getByRole("tabpanel")
  if (isMobile(page)) await panel.getByRole("listitem").filter({ hasText: process }).getByRole("link").click()
  else await panel.getByText(process).first().click()
}

async function approve(page: Page) {
  await page.getByRole("button", { name: "تأیید", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "ثبت «تأیید»" }).click()
  await expect(page).toHaveURL(/\/tasks$/)
}

test.describe("فرایندهای آماده", () => {
  test("فهرست فرایندهای آماده", async ({ page }) => {
    await page.goto("/workflow/ready")
    await expect(page.getByRole("heading", { level: 1, name: "فرایندهای آماده" })).toBeVisible()
    await expect(page.getByRole("region", { name: "مرخصی و تردد" })).toContainText("مرخصی ساعتی")
    await expectAccessible(page)
  })

  test("مرخصی ساعتی از درخواست تا پرونده", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop")
    test.setTimeout(120_000)
    await page.goto("/workflow/ready")
    await page.getByRole("button", { name: "فعال‌سازی همه" }).click()
    await expect(page.getByText("همه‌ی فرایندهای آماده فعال شدند.")).toBeVisible()
    await expect(page.getByText("۱۹ از ۱۹ فعال")).toBeVisible()

    // کارمند (برنامه‌نویس): کد پرسنلی و مانده از پرونده، فقط‌خواندنی
    const employee = await signIn(browser, info, "developer")
    const errors = collectErrors(employee)
    await employee.goto("/requests/new")
    await employee.getByRole("link", { name: "مرخصی ساعتی" }).click()
    await expect(employee.getByRole("heading", { level: 1, name: "مرخصی ساعتی" })).toBeVisible()
    await expect(employee.getByLabel("کد پرسنلی", { exact: true })).not.toHaveValue("")
    await expect(employee.getByLabel("کد پرسنلی", { exact: true })).not.toBeEditable()
    await expect(employee.getByLabel("مانده‌ی مرخصی استحقاقی (روز)", { exact: true })).not.toHaveValue("")
    // بیش از یک روز پذیرفته نیست (پیام سرور از تنظیمات)
    await employee.getByLabel("از ساعت تا ساعت", { exact: true }).fill("0600")
    await employee.getByLabel("از ساعت تا ساعت — تا ساعت", { exact: true }).fill("1800")
    await employee.getByRole("button", { name: "ثبت نهایی" }).click()
    await confirmReview(employee)
    await expect(employee.getByText(/مرخصی ساعتی بیش از یک روز/).first()).toBeVisible()
    await employee.getByLabel("از ساعت تا ساعت", { exact: true }).fill("1000")
    await employee.getByLabel("از ساعت تا ساعت — تا ساعت", { exact: true }).fill("1200")
    await employee.getByRole("button", { name: "ثبت نهایی" }).click()
    await confirmReview(employee)
    await expect(employee.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })).toContainText("درخواست «مرخصی ساعتی» ثبت شد.")
    await expectAccessible(employee)
    // تنها خطای مجاز، پاسخ ۴۰۰ همان درخواست بیش از یک روز است
    expect(errors.filter((e) => !e.includes("status of 400"))).toEqual([])
    await employee.context().close()

    // مدیر مستقیم (مدیر فناوری اطلاعات)
    const manager = await signIn(browser, info, "it_manager")
    await manager.goto("/tasks")
    await openTask(manager, "مرخصی ساعتی")
    await expect(manager.getByRole("heading", { level: 1, name: "تأیید مدیر مستقیم" })).toBeVisible()
    await approve(manager)
    await manager.context().close()

    // منابع انسانی: نقش تعیین‌شده در تنظیمات (کار گروهی)
    const hr = await signIn(browser, info, "hr_expert")
    await hr.goto("/tasks?box=group")
    await openTask(hr, "مرخصی ساعتی")
    await expect(hr.getByRole("heading", { level: 1, name: "بررسی منابع انسانی" })).toBeVisible()
    const claim = hr.getByRole("button", { name: "برداشتن کار" })
    if (await claim.isVisible()) await claim.click()
    await approve(hr)

    // ثبت خودکار در پرونده‌ی کارمند
    await hr.goto("/hr/employees")
    await hr.getByRole("main").getByText("نوری").first().click()
    await hr.getByRole("tab", { name: "درخواست‌ها و نامه‌ها" }).click()
    const events = hr.getByRole("region", { name: "درخواست‌ها و رویدادها" })
    await expect(events).toContainText("مرخصی ساعتی")
    await expect(events).toContainText("۲ ساعت")
    await expect(events).toContainText("مانده‌ی مرخصی استحقاقی امسال")
    await expectAccessible(hr)
    await hr.context().close()
  })
})
