import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible, isMobile } from "./helpers"

// نامه‌ها و گواهی‌ها (5.5): متن در تنظیمات، درخواست گواهی، تأیید منابع انسانی، چاپ رسمی از «پرونده‌ی من».
// نصب فرایندها سراسری است؛ گردش کامل فقط در اندازه‌ی desktop.

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

async function call(page: Page, method: string, url: string, body: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      return (await fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: JSON.stringify(body) })).json()
    },
    { method, url, body }
  )
}

test.describe("نامه‌ها و گواهی‌ها", () => {
  test("متن نامه‌ها در تنظیمات با جای‌گذارها", async ({ page }) => {
    await page.goto("/admin/settings?section=hr-letters")
    const section = page.getByRole("region", { name: "منابع انسانی: متن نامه‌ها" })
    const employment = section.getByLabel("گواهی اشتغال به کار", { exact: true })
    await expect(employment).toHaveValue(/\{name\}/)
    await employment.fill("گواهی برای ")
    await section.getByRole("group", { name: "افزودن جای‌گذار به گواهی اشتغال به کار" }).getByRole("button", { name: "نام و نام خانوادگی" }).click()
    await expect(employment).toHaveValue("گواهی برای {name}")
    await expectAccessible(page)
  })

  test("گواهی اشتغال از درخواست تا چاپ", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop")
    test.setTimeout(120_000)
    await page.goto("/workflow/ready")
    // فقط همین فرایند؛ «فعال‌سازی همه» را آزمون فرایندهای آماده می‌آزماید
    await call(page, "POST", "/api/workflow/ready/hr-letter-employment/active/", { active: true })

    const employee = await signIn(browser, info, "developer")
    const errors = collectErrors(employee)
    await employee.goto("/requests/new")
    await employee.getByRole("link", { name: "گواهی اشتغال به کار" }).click()
    await expect(employee.getByRole("heading", { level: 1, name: "گواهی اشتغال به کار" })).toBeVisible()
    await employee.getByLabel("ارائه به (مثلاً بانک ملت شعبه‌ی ونک)", { exact: true }).fill("بانک ملت شعبه‌ی ونک")
    await employee.getByRole("button", { name: "ثبت نهایی" }).click()
    await confirmReview(employee)
    await expect(employee.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })).toContainText("درخواست «گواهی اشتغال به کار» ثبت شد.")

    // منابع انسانی تأیید و صادر می‌کند
    const hr = await signIn(browser, info, "hr_expert")
    await hr.goto("/tasks?box=group")
    const panel = hr.getByRole("tabpanel")
    if (isMobile(hr)) await panel.getByRole("listitem").filter({ hasText: "گواهی اشتغال به کار" }).getByRole("link").click()
    else await panel.getByText("گواهی اشتغال به کار").first().click()
    await expect(hr.getByRole("heading", { level: 1, name: "بررسی و صدور منابع انسانی" })).toBeVisible()
    const claim = hr.getByRole("button", { name: "برداشتن کار" })
    if (await claim.isVisible()) await claim.click()
    await hr.getByRole("button", { name: "تأیید", exact: true }).click()
    await hr.getByRole("alertdialog").getByRole("button", { name: "ثبت «تأیید»" }).click()
    await expect(hr).toHaveURL(/\/tasks$/)
    await hr.context().close()

    // کارمند نامه را در «پرونده‌ی من» می‌بیند و برگه‌ی چاپ را باز می‌کند
    await employee.goto("/hr/me?tab=events")
    const letters = employee.getByRole("region", { name: "نامه‌ها و گواهی‌ها" })
    await expect(letters).toContainText("گواهی اشتغال به کار")
    await expect(letters).toContainText("بانک ملت شعبه‌ی ونک")
    await expectAccessible(employee)
    const href = await letters.getByRole("link", { name: /^چاپ گواهی اشتغال به کار/ }).getAttribute("href")
    await employee.goto(href!)
    await expect(employee.getByRole("heading", { level: 1, name: "گواهی اشتغال به کار" })).toBeVisible()
    await expect(employee.getByRole("article")).toContainText("حسین نوری")
    await expect(employee.getByRole("article")).toContainText("جهت ارائه به بانک ملت شعبه‌ی ونک")
    await expect(employee.getByRole("article")).toContainText("سارا محمدی")
    await expectAccessible(employee)
    expect(errors).toEqual([])
    await employee.context().close()
  })
})
