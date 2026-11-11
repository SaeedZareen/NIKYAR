import { expect, test, type Browser, type Page } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")

async function api(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: body ? JSON.stringify(body) : undefined })
      return r.json()
    },
    { method, url, body }
  )
}

/** کاربر تازه برای هر آزمون (تغییر گذرواژه و جانشینی روی کاربر مشترک، آزمون‌های هم‌زمان را خراب می‌کند). */
async function signInAsNewUser(page: Page, browser: Browser, name: string) {
  const username = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
  await page.goto("/")
  await api(page, "POST", "/api/auth/users/", { username, first_name: "نیما", last_name: "حسابی", gender: "male", password: "First-Pass-123" })
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() ?? undefined })
  const other = await context.newPage()
  await other.goto("/login")
  await other.getByLabel("نام کاربری", { exact: true }).fill(username)
  await other.getByLabel("گذرواژه", { exact: true }).fill("First-Pass-123")
  await other.getByRole("button", { name: "ورود" }).click()
  await expect(other.getByText("خوش آمدید", { exact: false })).toBeVisible()
  return { other, context, username }
}

test.describe("حساب من", () => {
  test("مشخصات، امضا و گذرواژه", async ({ page, browser }) => {
    const { other, context } = await signInAsNewUser(page, browser, "acct")
    await other.goto("/account")
    await expect(other.getByRole("heading", { level: 1, name: "حساب من" })).toBeVisible()
    const contact = other.getByRole("region", { name: "راه‌های ارتباط و امضا" })
    await contact.getByLabel("موبایل", { exact: true }).fill("۰۹۱۲۳۴۵۶۷۸۹")
    await contact.getByLabel("ایمیل", { exact: true }).fill("nima@example.ir")
    await contact.locator('input[type="file"]').setInputFiles({ name: "sign.png", mimeType: "image/png", buffer: PNG })
    await expect(contact.getByRole("img", { name: "تصویر امضای شما" })).toBeVisible()
    await contact.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(other.getByText("مشخصات شما ذخیره شد.")).toBeVisible()
    await other.reload()
    await expect(contact.getByLabel("موبایل", { exact: true })).toHaveValue("09123456789")
    await expectAccessible(other)

    await other.getByRole("tab", { name: "گذرواژه" }).click()
    await expect(other).toHaveURL(/tab=password/)
    const pw = other.getByRole("region", { name: "تغییر گذرواژه" })
    await pw.getByLabel("گذرواژه‌ی فعلی", { exact: true }).fill("اشتباه")
    await pw.getByLabel("گذرواژه‌ی جدید", { exact: true }).fill("Second-Pass-456")
    await pw.getByLabel("تکرار گذرواژه‌ی جدید", { exact: true }).fill("Second-Pass-456")
    await pw.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(other.getByRole("alert").first()).toContainText("گذرواژه‌ی فعلی")
    await pw.getByLabel("گذرواژه‌ی فعلی", { exact: true }).fill("First-Pass-123")
    await pw.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(other.getByText("گذرواژه تغییر کرد.")).toBeVisible()
    await context.close()
  })

  test("تعیین جانشین، دیدن آن در صفحه‌ی راهبر و لغو", async ({ page, browser }) => {
    const { other, context } = await signInAsNewUser(page, browser, "boss")
    await other.goto("/account?tab=delegation")
    const mine = other.getByRole("region", { name: "جانشین‌های من" })
    await mine.getByRole("button", { name: "جانشین جدید" }).click()
    const sheet = other.getByRole("dialog", { name: "جانشین جدید" })
    await sheet.getByRole("combobox", { name: "جانشین" }).click()
    await other.getByPlaceholder("نام، نام کاربری یا موبایل").fill("accountant")
    await other.getByRole("option", { name: /زهرا موسوی/ }).click()
    const end = await other.evaluate(() => {
      const d = new Date(Date.now() + 5 * 86400000)
      return new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d)
    })
    const part = (t: string) => end.find((p) => p.type === t)!.value
    await sheet.getByLabel("تا تاریخ", { exact: true }).fill(`${part("year")}${part("month")}${part("day")}`)
    await sheet.getByLabel("علت", { exact: true }).fill("مرخصی استحقاقی")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(other.getByText(/خانم زهرا موسوی از .+ جانشین آقای نیما حسابی شد\./)).toBeVisible()
    const rows = isMobile(other) ? mine.getByRole("listitem") : mine.locator("tbody tr")
    await expect(rows.filter({ hasText: "جاری" })).toHaveCount(1)
    // بی فرایند انتخاب‌شده، جانشینی کامل است
    await expect(rows.filter({ hasText: "جاری" })).toContainText("همه‌ی فرایندها")
    await expectAccessible(other)

    await page.goto("/admin/delegations")
    const adminRows = isMobile(page) ? page.getByRole("list", { name: "فهرست ردیف‌ها" }).getByRole("listitem") : page.locator("tbody tr")
    await expect(adminRows.filter({ hasText: "نیما حسابی" }).first()).toBeVisible()

    await rows.filter({ hasText: "جاری" }).getByRole("button", { name: "عملیات ردیف" }).click()
    await other.getByRole("menuitem", { name: "لغو جانشینی" }).click()
    await other.getByRole("alertdialog").getByRole("button", { name: "لغو جانشینی" }).click()
    await expect(other.getByText("جانشینی لغو شد.")).toBeVisible()
    await expect(rows.filter({ hasText: "جاری" })).toHaveCount(0)
    await context.close()
  })
})
