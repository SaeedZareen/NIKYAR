import { expect, test, type Browser, type TestInfo } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible, isMobile } from "./helpers"

// دوران خدمت ۱ (5.8a): «درخواست اصلاح» از «پرونده‌ی من» تا اصلاح خودکار پرونده پس از تأیید منابع انسانی.

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

test("اصلاح اطلاعات پرونده از «پرونده‌ی من»", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop")
  test.setTimeout(150_000)
  await page.goto("/workflow/ready")
  await page.evaluate(async () => {
    const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
    await fetch("/api/workflow/ready/hr-correction/active/", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: JSON.stringify({ active: true }) })
  })

  const employee = await signIn(browser, info, "developer")
  const errors = collectErrors(employee)
  await employee.goto("/hr/me")
  await employee.getByRole("link", { name: "درخواست اصلاح" }).click()
  await expect(employee.getByRole("heading", { level: 1, name: "اصلاح اطلاعات پرونده" })).toBeVisible()
  await employee.getByRole("radio", { name: "محل تولد" }).click()
  await employee.getByLabel("مقدار درست", { exact: true }).fill("شیراز")
  await employee.getByRole("button", { name: "ثبت نهایی" }).click()
  await confirmReview(employee)
  await expect(employee.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })).toContainText("درخواست «اصلاح اطلاعات پرونده» ثبت شد.")
  expect(errors).toEqual([])

  const hr = await signIn(browser, info, "hr_expert")
  await hr.goto("/tasks?box=group")
  const panel = hr.getByRole("tabpanel")
  if (isMobile(hr)) await panel.getByRole("listitem").filter({ hasText: "اصلاح اطلاعات پرونده" }).getByRole("link").click()
  else await panel.getByText("اصلاح اطلاعات پرونده").first().click()
  const claim = hr.getByRole("button", { name: "برداشتن کار" })
  if (await claim.isVisible()) await claim.click()
  await hr.getByRole("button", { name: "تأیید", exact: true }).click()
  await hr.getByRole("alertdialog").getByRole("button", { name: "ثبت «تأیید»" }).click()
  await expect(hr).toHaveURL(/\/tasks$/)
  await hr.context().close()

  // پرونده خودکار اصلاح شده و رویدادش ثبت است
  await employee.goto("/hr/me")
  await expect(employee.getByRole("tabpanel")).toContainText("شیراز")
  await employee.goto("/hr/me?tab=events")
  await expect(employee.getByRole("region", { name: "درخواست‌ها و رویدادها" })).toContainText("محل تولد: — ← شیراز")
  await expectAccessible(employee)
  await employee.context().close()
})
