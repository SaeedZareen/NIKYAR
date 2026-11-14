import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { collectErrors, expectAccessible, isMobile } from "./helpers"

const DEFINITION = {
  sections: [
    {
      id: "main",
      title: "درخواست",
      columns: 2,
      fields: [
        { id: "subject", type: "text", label: "موضوع", required: true },
        { id: "kind", type: "choice", label: "نوع تأمین", props: { options: [{ value: "store", label: "انبار" }, { value: "buy", label: "خرید" }] } },
        { id: "price", type: "amount", label: "مبلغ" },
        { id: "urgent", type: "boolean", label: "فوری" },
      ],
    },
  ],
}

async function call(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: body ? JSON.stringify(body) : undefined })
      return r.json()
    },
    { method, url, body }
  )
}

/** فرم شماره‌دار منتشرشده با دو ثبت نهایی از راهبر (روش 3.4 و 3.7). */
async function formWithSubmissions(page: Page, title: string) {
  await page.goto("/forms")
  const code = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const form = await call(page, "POST", "/api/forms/", { code, title, fill_by_everyone: true, number_pattern: "گز-{seq:3}", number_reset: "never" })
  await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition: DEFINITION })
  await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
  const first = await call(page, "POST", "/api/forms/submissions/", { form: form.id, submit: true, data: { subject: "کاغذ A4", kind: "store", price: 1200000, urgent: false } })
  const second = await call(page, "POST", "/api/forms/submissions/", { form: form.id, submit: true, data: { subject: "چاپگر", kind: "buy", price: 45000000, urgent: true } })
  return { id: form.id as number, first: first as { id: number; number: string }, second: second as { id: number; number: string } }
}

test.describe("ثبت‌های فرم", () => {
  test("ثبت‌های من، مشاهده‌ی ثبت و برگه‌ی چاپ", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `گزارش آزمون ${info.project.name} ${Date.now()}`
    const { second } = await formWithSubmissions(page, title)

    await page.goto("/forms/mine")
    await expect(page.getByRole("heading", { level: 1, name: "ثبت‌های من" })).toBeVisible()
    await page.getByRole("searchbox", { name: "عنوان فرم یا شماره" }).fill(title)
    await expect(page.getByRole("link", { name: title })).toHaveCount(2)
    await expectAccessible(page)

    // مشاهده: مشخصات ثبت و مقدارهای خوانا
    await page.goto(`/forms/submissions/${second.id}`)
    await expect(page.getByRole("heading", { level: 1, name: `${title} گز-۰۰۲` })).toBeVisible()
    const info1 = page.getByRole("region", { name: "مشخصات ثبت" })
    await expect(info1).toContainText("گز-۰۰۲")
    const values = page.getByRole("region", { name: "اطلاعات فرم" })
    await expect(values).toContainText("چاپگر")
    await expect(values).toContainText("خرید")
    await expect(values).toContainText("۴۵٬۰۰۰٬۰۰۰ ریال")
    await expect(page.getByRole("link", { name: "چاپ" })).toHaveAttribute("href", `/print/submissions/${second.id}?print=1`)
    await expectAccessible(page)

    // برگه‌ی چاپ بی پوسته‌ی برنامه (بدون print=1 تا پنجره‌ی چاپ باز نشود)
    await page.goto(`/print/submissions/${second.id}`)
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
    await expect(page.getByRole("navigation")).toHaveCount(0)
    await expect(page.getByRole("article")).toContainText("گز-۰۰۲")
    await expect(page.getByRole("article")).toContainText("امضای ثبت‌کننده")
    await expect(page.getByRole("button", { name: "چاپ" })).toBeVisible()
    await expectAccessible(page)
    expect(errors).toEqual([])
  })

  test("جدول ثبت‌های یک فرم با ستون فیلدها، جست‌وجو و خروجی اکسل", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `گزارش جدول ${info.project.name} ${Date.now()}`
    const form = await formWithSubmissions(page, title)

    await page.goto("/forms/reports")
    await expect(page.getByRole("heading", { level: 1, name: "ثبت‌های فرم‌ها" })).toBeVisible()
    await page.getByRole("searchbox", { name: "عنوان یا دسته‌ی فرم" }).fill(title)
    await expect(page).toHaveURL(/[?&]q=/)
    await page.getByRole("link", { name: title }).click()
    await expect(page).toHaveURL(new RegExp(`/forms/reports/${form.id}$`))
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
    await expect(page.getByText("۲ ثبت نهایی")).toBeVisible()
    if (!isMobile(page)) {
      for (const name of ["شماره", "موضوع", "نوع تأمین", "مبلغ", "فوری"]) await expect(page.getByRole("button", { name: `گزینه‌های ستون ${name}`, exact: true })).toBeVisible()
      await expect(page.getByRole("cell", { name: "انبار" })).toBeVisible()
    }
    await expectAccessible(page)

    // جست‌وجو در متن خوانای مقدارها (برچسب گزینه، نه کد آن)
    await page.getByRole("searchbox", { name: "جست‌وجو در همه‌ی ستون‌ها" }).fill("انبار")
    await expect(page.getByRole("link", { name: "گز-۰۰۱" })).toBeVisible()
    await expect(page.getByRole("link", { name: "گز-۰۰۲" })).toHaveCount(0)

    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "خروجی اکسل" }).click()
    const lines = readFileSync(await (await download).path(), "utf-8").slice(1).split("\r\n")
    expect(lines[0]).toContain("نوع تأمین")
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain("گز-001")
    expect(lines[1]).toContain("انبار")
    expect(lines[1]).toContain("1200000")

    // ردیف به صفحه‌ی مشاهده می‌رود
    await page.getByRole("link", { name: "گز-۰۰۱" }).click()
    await expect(page.getByRole("region", { name: "اطلاعات فرم" })).toContainText("کاغذ A4")
    expect(errors).toEqual([])
  })

  test("بدون نقش بیننده، «ثبت‌های فرم‌ها» در منو نیست و صفحه‌اش بسته است", async ({ page, browser }, info) => {
    const username = `viewer_${info.project.name}_${Date.now()}`
    await page.goto("/")
    await call(page, "POST", "/api/auth/users/", { username, first_name: "رضا", last_name: "بی‌مجوز", gender: "male", must_change_password: false, password: "Viewer-Pass-123" })
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, ...(info.project.use.viewport ? { viewport: info.project.use.viewport } : {}) })
    const other = await context.newPage()
    await other.goto("/login")
    await other.getByLabel("نام کاربری", { exact: true }).fill(username)
    await other.getByLabel("گذرواژه", { exact: true }).fill("Viewer-Pass-123")
    await other.getByRole("button", { name: "ورود" }).click()
    await expect(other).not.toHaveURL(/\/login/)

    await other.goto("/forms/mine")
    await expect(other.getByText("هنوز فرمی پر نکرده‌اید")).toBeVisible()
    if (!isMobile(other)) {
      const nav = other.locator("[data-slot=sidebar]")
      await expect(nav.getByRole("link", { name: "ثبت‌های من" })).toBeVisible()
      await expect(nav.getByRole("link", { name: "ثبت‌های فرم‌ها" })).toHaveCount(0)
    }
    await other.goto("/forms/reports")
    await expect(other.getByText("برای مشاهده‌ی این بخش مجوز ندارید.")).toBeVisible()
    await context.close()
  })
})
