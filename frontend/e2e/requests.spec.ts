import { expect, test, type Page } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible } from "./helpers"

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

const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** فرایند منتشرشده با فرم اصلی «موضوع» و شماره‌ی پیگیری؛ بی مرحله (شروع تا پایان). */
async function publishedProcess(page: Page, title: string) {
  await page.goto("/requests/new")
  const form = await call(page, "POST", "/api/forms/", { code: unique("rq"), title: `فرم ${title}`, fill_by_everyone: true })
  const definition = {
    sections: [
      {
        id: "s",
        fields: [
          { id: "subject", type: "text", label: "موضوع", required: true },
          { id: "ref", type: "hidden", label: "شماره‌ی درخواست", props: { process_value: "number" } },
        ],
      },
    ],
  }
  await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition })
  await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
  const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("p"), title, form: form.id, number_pattern: "د-{year}-{seq:3}" })
  await call(page, "POST", `/api/workflow/versions/${process.draft_version}/publish/`)
  return process as { id: number }
}

test.describe("درخواست جدید", () => {
  test("پیش‌نویس خودکار، ثبت به نام همکار، ادامه از فهرست و ثبت با شماره", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `درخواست آزمون ${info.project.name} ${Date.now()}`
    await publishedProcess(page, title)
    const username = unique("rq")
    await call(page, "POST", "/api/auth/users/", { username, first_name: "رضا", last_name: `همکار ${info.project.name}`, gender: "male", password: "First-Pass-123" })
    const colleague = `رضا همکار ${info.project.name}`

    await page.goto("/requests/new")
    await expect(page.getByRole("heading", { level: 1, name: "درخواست جدید" })).toBeVisible()
    await page.getByRole("link", { name: title }).click()
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()

    // ثبت به نام دیگری (مدیر کل اجازه دارد)
    const behalf = page.getByRole("region", { name: "ثبت‌کننده" })
    await behalf.getByRole("combobox").click()
    await page.getByPlaceholder("نام، نام کاربری یا موبایل").fill(username)
    await page.getByRole("option", { name: new RegExp(colleague) }).click()
    await expect(behalf.getByRole("combobox")).toContainText(colleague)

    await page.getByLabel("موضوع", { exact: true }).fill("خرید صندلی")
    await expect(page.getByText(/پیش‌نویس ذخیره شد/)).toBeVisible()
    await expect(page).toHaveURL(/draft=\d+/)
    await expectAccessible(page)

    // ادامه از پیش‌نویس‌ها: «به نام» و داده می‌ماند
    await page.goto("/requests/new")
    const drafts = page.getByRole("region", { name: "پیش‌نویس‌های درخواست" })
    await expect(drafts.getByText(colleague).first()).toBeVisible()
    await drafts.getByText(title).first().click()
    await expect(page.getByLabel("موضوع", { exact: true })).toHaveValue("خرید صندلی")
    await expect(page.getByRole("region", { name: "ثبت‌کننده" }).getByRole("combobox")).toContainText(colleague)

    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await confirmReview(page)
    const status = page.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })
    await expect(status).toContainText(`درخواست «${title}» ثبت شد.`)
    await expect(status).toContainText(/د-[۰-۹]{4}-[۰-۹]{3}/)
    await expect(page.getByRole("link", { name: "ثبت درخواست دیگر" })).toBeVisible()
    await expectAccessible(page)

    // به نام همکار ثبت شده و شماره در فیلد پنهان فرم هم نشسته است
    const list = await call(page, "GET", "/api/workflow/requests/?status=completed")
    const sent = list.results.find((r: { process_title: string }) => r.process_title === title)
    expect(sent.requester_name).toContain(colleague)
    expect(sent.data.ref).toBe(sent.number)
    await page.getByRole("link", { name: "بازگشت به درخواست جدید" }).click()
    await expect(page.getByRole("region", { name: "پیش‌نویس‌های درخواست" }).getByText(title)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test("حذف پیش‌نویس درخواست", async ({ page }, info) => {
    const title = `حذف پیش‌نویس ${info.project.name} ${Date.now()}`
    await publishedProcess(page, title)
    await page.goto("/requests/new")
    await page.getByRole("link", { name: title }).click()
    await page.getByLabel("موضوع", { exact: true }).fill("موقت")
    await expect(page).toHaveURL(/draft=\d+/)
    await page.getByRole("button", { name: "حذف پیش‌نویس", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف پیش‌نویس" }).click()
    await expect(page.getByText("پیش‌نویس حذف شد.")).toBeVisible()
    await expect(page).toHaveURL(/\/requests\/new$/)
    await expect(page.getByRole("link", { name: title })).toBeVisible()
  })
})
