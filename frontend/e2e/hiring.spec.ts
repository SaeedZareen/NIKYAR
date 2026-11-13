import { expect, test, type Browser, type TestInfo } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible, isMobile } from "./helpers"

// ورود کارمند (5.7a): استخدام به دست منابع انسانی، تأیید مدیرعامل، ساخت خودکار پرونده و حساب کاربری.
// نصب فرایند سراسری است؛ فقط در اندازه‌ی desktop.

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

test("استخدام: از فرم منابع انسانی تا پرونده و حساب کاربری", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop")
  test.setTimeout(150_000)
  await page.goto("/workflow/ready")
  await page.evaluate(async () => {
    const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
    await fetch("/api/workflow/ready/hr-hire/active/", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: JSON.stringify({ active: true }) })
  })

  // کارمند عادی «استخدام» را نمی‌بیند
  const other = await signIn(browser, info, "developer")
  await other.goto("/requests/new")
  await expect(other.getByRole("heading", { level: 1, name: "درخواست جدید" })).toBeVisible()
  await expect(other.getByRole("link", { name: "استخدام", exact: true })).toHaveCount(0)
  await other.context().close()

  const hr = await signIn(browser, info, "hr_expert")
  const errors = collectErrors(hr)
  await hr.goto("/requests/new")
  await hr.getByRole("link", { name: "استخدام", exact: true }).click()
  await expect(hr.getByRole("heading", { level: 1, name: "استخدام" })).toBeVisible()
  await hr.getByLabel("نام", { exact: true }).fill("نیلوفر")
  await hr.getByLabel("نام خانوادگی", { exact: true }).fill("کاظمی")
  await hr.getByLabel("کد ملی", { exact: true }).fill("0001000004")
  await hr.getByRole("radio", { name: "زن" }).click()
  await hr.getByLabel("تاریخ استخدام", { exact: true }).fill("14050801")
  await hr.getByRole("radio", { name: "قراردادی" }).click()
  await hr.getByLabel("نام کاربری", { exact: true }).fill("n.kazemi")
  await expectAccessible(hr)
  await hr.getByRole("button", { name: "ثبت نهایی" }).click()
  await confirmReview(hr)
  await expect(hr.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })).toContainText("درخواست «استخدام» ثبت شد.")
  expect(errors).toEqual([])

  // مدیرعامل تأیید می‌کند
  const ceo = await signIn(browser, info, "ceo")
  await ceo.goto("/tasks")
  const panel = ceo.getByRole("tabpanel")
  if (isMobile(ceo)) await panel.getByRole("listitem").filter({ hasText: "استخدام" }).getByRole("link").click()
  else await panel.getByText("استخدام", { exact: true }).first().click()
  await expect(ceo.getByRole("heading", { level: 1, name: "تأیید مدیرعامل" })).toBeVisible()
  await ceo.getByRole("button", { name: "تأیید", exact: true }).click()
  await ceo.getByRole("alertdialog").getByRole("button", { name: "ثبت «تأیید»" }).click()
  await expect(ceo).toHaveURL(/\/tasks$/)
  await ceo.context().close()

  // پرونده‌ی تازه با رویداد «استخدام»
  await hr.goto("/hr/employees")
  await hr.getByRole("main").getByText("نیلوفر کاظمی").first().click()
  await expect(hr.getByRole("heading", { level: 1, name: "نیلوفر کاظمی" })).toBeVisible()
  await hr.getByRole("tab", { name: "درخواست‌ها و نامه‌ها" }).click()
  await expect(hr.getByRole("region", { name: "درخواست‌ها و رویدادها" })).toContainText("استخدام")
  await hr.getByRole("tab", { name: "استخدام" }).click()
  // حساب کاربری ساخته و به پرونده وصل شده است
  await expect(hr.getByRole("tabpanel")).toContainText(/کاربر سامانه.*نیلوفر کاظمی/)
  await hr.context().close()
})
