import { expect, test, type Browser, type TestInfo } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible, isMobile } from "./helpers"

// ورود کارمند ۲ (5.7b): تنظیم دوره‌ی آزمایشی، و تحویل تجهیزات با تأیید دریافت خود کارمند تا ثبت در پرونده‌اش.

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

test.describe("ورود کارمند", () => {
  test("تنظیمات ورود کارمند و پایان دوره‌ی آزمایشی در پرونده", async ({ page }) => {
    await page.goto("/admin/settings?section=hr-onboarding")
    const section = page.getByRole("region", { name: "منابع انسانی: ورود کارمند" })
    await expect(section.getByLabel("طول دوره‌ی آزمایشی", { exact: true })).toHaveValue("90")
    await expectAccessible(page)
    await page.goto("/hr/employees")
    await page.getByRole("main").getByText("نوری").first().click()
    await page.getByRole("tab", { name: "استخدام" }).click()
    await expect(page.getByRole("tabpanel")).toContainText("پایان دوره‌ی آزمایشی")
  })

  test("تحویل تجهیزات با تأیید دریافت کارمند", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop")
    test.setTimeout(150_000)
    await page.goto("/workflow/ready")
    await page.evaluate(async () => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      await fetch("/api/workflow/ready/hr-equipment/active/", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: JSON.stringify({ active: true }) })
    })

    const it = await signIn(browser, info, "it_manager")
    const errors = collectErrors(it)
    await it.goto("/requests/new")
    await it.getByRole("link", { name: "تحویل تجهیزات و دارایی" }).click()
    await it.getByLabel("تحویل‌گیرنده", { exact: true }).click()
    await it.getByPlaceholder("نام، نام کاربری یا موبایل").fill("developer")
    await it.getByRole("option", { name: /نوری/ }).click()
    await it.getByLabel("شرح (مثلاً رایانه‌ی همراه) ردیف ۱", { exact: true }).fill("رایانه‌ی همراه")
    await it.getByLabel("شماره‌ی سریال یا اموال ردیف ۱", { exact: true }).fill("SN-204")
    await it.getByRole("button", { name: "ثبت نهایی" }).click()
    await confirmReview(it)
    await expect(it.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })).toContainText("درخواست «تحویل تجهیزات و دارایی» ثبت شد.")
    expect(errors).toEqual([])
    await it.context().close()

    // خود کارمند دریافت را تأیید می‌کند
    const employee = await signIn(browser, info, "developer")
    await employee.goto("/tasks")
    const panel = employee.getByRole("tabpanel")
    if (isMobile(employee)) await panel.getByRole("listitem").filter({ hasText: "تحویل تجهیزات" }).getByRole("link").click()
    else await panel.getByText("تحویل تجهیزات و دارایی").first().click()
    await expect(employee.getByRole("heading", { level: 1, name: "تأیید دریافت کارمند" })).toBeVisible()
    await employee.getByRole("button", { name: "تأیید", exact: true }).click()
    await employee.getByRole("alertdialog").getByRole("button", { name: "ثبت «تأیید»" }).click()
    await expect(employee).toHaveURL(/\/tasks$/)

    await employee.goto("/hr/me?tab=events")
    const events = employee.getByRole("region", { name: "درخواست‌ها و رویدادها" })
    await expect(events).toContainText("تحویل تجهیزات")
    await expectAccessible(employee)
    await employee.context().close()
  })
})
