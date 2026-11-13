import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible, isMobile } from "./helpers"

// مالی و رفاه (5.6): تنظیمات سقف‌ها، و مساعده‌ی زیر سقف مدیرعامل از درخواست تا پرونده (مدیر ← منابع انسانی ← امور مالی).
// نصب فرایند سراسری است؛ گردش کامل فقط در اندازه‌ی desktop.

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

async function approveTask(browser: Browser, info: TestInfo, username: string, box: string, step: string) {
  const page = await signIn(browser, info, username)
  await page.goto(`/tasks?box=${box}`)
  const panel = page.getByRole("tabpanel")
  if (isMobile(page)) await panel.getByRole("listitem").filter({ hasText: "مساعده" }).getByRole("link").click()
  else await panel.getByText("مساعده", { exact: true }).first().click()
  await expect(page.getByRole("heading", { level: 1, name: step })).toBeVisible()
  const claim = page.getByRole("button", { name: "برداشتن کار" })
  if (await claim.isVisible()) await claim.click()
  await page.getByRole("button", { name: "تأیید", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "ثبت «تأیید»" }).click()
  await expect(page).toHaveURL(/\/tasks$/)
  await page.context().close()
}

async function activate(page: Page, code: string) {
  await page.evaluate(async (code) => {
    const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
    await fetch(`/api/workflow/ready/${code}/active/`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: JSON.stringify({ active: true }) })
  }, code)
}

test.describe("مالی و رفاه", () => {
  test("تنظیمات مالی و رفاه", async ({ page }) => {
    await page.goto("/admin/settings?section=hr-welfare")
    const section = page.getByRole("region", { name: "منابع انسانی: مالی و رفاه" })
    await expect(section.getByLabel("سقف هر مساعده", { exact: true })).toHaveValue("100,000,000")
    await expect(section.getByLabel("بیشترین شمار اقساط وام", { exact: true })).toHaveValue("24")
    await expectAccessible(page)
  })

  test("مساعده از درخواست تا پرونده", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop")
    test.setTimeout(150_000)
    await page.goto("/workflow/ready")
    await activate(page, "hr-advance")

    const employee = await signIn(browser, info, "developer")
    const errors = collectErrors(employee)
    await employee.goto("/requests/new")
    await employee.getByRole("link", { name: "مساعده" }).click()
    await expect(employee.getByRole("heading", { level: 1, name: "مساعده" })).toBeVisible()
    await employee.getByLabel("مبلغ مساعده", { exact: true }).fill("20000000")
    await employee.getByRole("button", { name: "ثبت نهایی" }).click()
    await confirmReview(employee)
    await expect(employee.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })).toContainText("درخواست «مساعده» ثبت شد.")
    expect(errors).toEqual([])
    await employee.context().close()

    await approveTask(browser, info, "it_manager", "mine", "تأیید مدیر مستقیم")
    await approveTask(browser, info, "hr_expert", "group", "بررسی منابع انسانی")
    await approveTask(browser, info, "accountant", "mine", "بررسی امور مالی")

    // زیر سقف مدیرعامل: پس از امور مالی در پرونده ثبت می‌شود
    await page.goto("/hr/employees")
    await page.getByRole("main").getByText("نوری").first().click()
    await page.getByRole("tab", { name: "درخواست‌ها و نامه‌ها" }).click()
    const events = page.getByRole("region", { name: "درخواست‌ها و رویدادها" })
    await expect(events).toContainText("مساعده")
    await expect(events).toContainText("۲۰٬۰۰۰٬۰۰۰ ریال")
    await expectAccessible(page)
  })
})
