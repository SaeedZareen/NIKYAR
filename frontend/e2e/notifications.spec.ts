import { expect, test, type Page } from "@playwright/test"
import { expectAccessible } from "./helpers"

async function adminApi(page: Page, method: string, url: string, body: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: JSON.stringify(body) })
      return r.json()
    },
    { method, url, body }
  )
}

test.describe("اعلان‌ها", () => {
  test("تغییر گذرواژه‌ی کاربر به دست راهبر در زنگوله‌ی همان کاربر دیده می‌شود", async ({ page, browser }, info) => {
    const username = `notif_${info.project.name}_${Date.now()}`
    await page.goto("/")
    const user = await adminApi(page, "POST", "/api/auth/users/", { username, first_name: "مینا", last_name: "اعلانی", gender: "female", password: "First-Pass-123" })
    await adminApi(page, "PATCH", `/api/auth/users/${user.id}/`, { password: "Second-Pass-456" })

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, ...(info.project.use.viewport ? { viewport: info.project.use.viewport } : {}) })
    const other = await context.newPage()
    await other.goto("/login")
    await other.getByLabel("نام کاربری", { exact: true }).fill(username)
    await other.getByLabel("گذرواژه", { exact: true }).fill("Second-Pass-456")
    await other.getByRole("button", { name: "ورود" }).click()

    const bell = other.getByRole("button", { name: "اعلان‌ها، ۲ خوانده‌نشده" })
    await expect(bell).toBeVisible()
    await bell.click()
    const latest = other.getByRole("list", { name: "آخرین اعلان‌ها" })
    await expect(latest.getByRole("listitem")).toHaveCount(2)
    await expect(latest).toContainText("خانم مینا اعلانی، حساب کاربری شما در نیک‌یار ساخته شد.")
    await expect(latest).toContainText("توسط مدیر سامانه تغییر کرد")
    await expectAccessible(other)

    await latest.getByRole("button", { name: /گذرواژه‌ی شما/ }).click()
    await expect(other.getByRole("button", { name: "اعلان‌ها، ۱ خوانده‌نشده" })).toBeVisible()

    await other.goto("/notifications")
    await expect(other.getByText("۱ اعلان خوانده‌نشده")).toBeVisible()
    await other.getByRole("button", { name: "همه خوانده شد" }).click()
    await expect(other.getByText("همه‌ی اعلان‌ها خوانده شده‌اند.")).toBeVisible()
    await expect(other.getByRole("banner").getByRole("button", { name: "اعلان‌ها", exact: true })).toBeVisible()
    await expectAccessible(other)
    await context.close()
  })

  test("متن اعلان: درج جای‌گذار، پیش‌نمایش و خطای جای‌گذار ناشناخته", async ({ page }) => {
    await page.goto("/admin/settings?section=notification-templates")
    const section = page.getByRole("region", { name: "متن اعلان‌ها" })
    await expect(section).toContainText("ایجاد حساب کاربری")
    await section.getByRole("button", { name: "عملیات ردیف" }).first().click()
    await page.getByRole("menuitem", { name: "ویرایش متن" }).click()
    const sheet = page.getByRole("dialog")
    const field = sheet.getByLabel("متن اعلان", { exact: true })
    await field.fill("سلام ")
    await sheet.getByRole("group", { name: "افزودن جای‌گذار" }).getByRole("button").first().click()
    await expect(sheet).toContainText(/نمونه: سلام \S+/)
    await field.pressSequentially(" {foo}")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByRole("alert").first()).toContainText("جای‌گذار {foo} برای این اعلان تعریف نشده است.")
    await expect(sheet.getByRole("button", { name: "متن پیش‌فرض" })).toBeVisible()
    await expectAccessible(page)
  })
})
