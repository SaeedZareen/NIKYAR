import { expect, test, type Page } from "@playwright/test"
import { collectErrors, expectAccessible } from "./helpers"

const DEFINITION = {
  sections: [
    {
      id: "main",
      title: "درخواست",
      columns: 2,
      fields: [
        { id: "title", type: "text", label: "عنوان", required: true },
        { id: "amount", type: "amount", label: "مبلغ", required: true, help: "مبلغ کل به ریال" },
        { id: "qty", type: "number", label: "تعداد", props: { min: 1, unit: "عدد" } },
        { id: "day", type: "date", label: "تاریخ" },
        { id: "urgent", type: "boolean", label: "فوری", required: true },
        { id: "tags", type: "multi_choice", label: "روش تأمین", props: { options: [{ value: "a", label: "انبار" }, { value: "b", label: "خرید" }] } },
        { id: "notes", type: "textarea", label: "توضیحات", span: 2, props: { max_length: 300 } },
      ],
    },
  ],
}

/** فرم منتشرشده‌ی یکتا برای هر آزمون، با همان API که طراح (3.4) به کار می‌برد. */
async function publishForm(page: Page, title: string): Promise<number> {
  await page.goto("/forms")
  return page.evaluate(
    async ({ title, definition }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const call = (url: string, method: string, body?: unknown) =>
        fetch(url, { method, headers: { "X-CSRFToken": token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json())
      const code = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const form = await call("/api/forms/", "POST", { code, title, fill_by_everyone: true })
      await call(`/api/forms/versions/${form.draft_version}/`, "PATCH", { definition })
      await call(`/api/forms/versions/${form.draft_version}/publish/`, "POST")
      return form.id as number
    },
    { title, definition: DEFINITION }
  )
}

test.describe("پر کردن فرم", () => {
  test("خطای فارسی، پیش‌نویس خودکار، ادامه از «فرم‌ها» و ثبت نهایی", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `درخواست آزمون ${info.project.name} ${Date.now()}`
    await publishForm(page, title)

    await page.goto("/forms")
    await page.getByRole("link", { name: title }).click()
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()

    // ثبت خالی: خلاصه‌ی خطا با پیام‌های همان طرح سرور
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("تکمیل «عنوان» الزامی است.")
    await expect(summary).toContainText("تکمیل «مبلغ» الزامی است.")
    await expect(summary).toContainText("تکمیل «فوری» الزامی است.")
    await expectAccessible(page)

    await page.getByLabel("تعداد", { exact: true }).fill("0")
    await expect(page.getByText("«تعداد» نباید کمتر از ۱ باشد.").first()).toBeVisible()
    await page.getByLabel("تعداد", { exact: true }).fill("3")
    await page.getByLabel("عنوان", { exact: true }).fill("خرید کاغذ")
    await page.getByLabel("توضیحات", { exact: true }).fill("برای واحد مالی")
    await expect(page.getByText("۱۴ از ۳۰۰ نویسه")).toBeVisible()

    // پیش‌نویس خودکار ذخیره و شناسه‌اش در نشانی می‌آید
    await expect(page.getByText(/پیش‌نویس ذخیره شد/)).toBeVisible()
    await expect(page).toHaveURL(/draft=\d+/)

    // ادامه از فهرست پیش‌نویس‌ها
    await page.goto("/forms")
    const drafts = page.getByRole("region", { name: "پیش‌نویس‌های من" })
    await drafts.getByText(title).first().click()
    await expect(page.getByLabel("عنوان", { exact: true })).toHaveValue("خرید کاغذ")
    await expect(page.getByLabel("تعداد", { exact: true })).toHaveValue("3")

    await page.getByLabel("مبلغ", { exact: true }).fill("2500000")
    await expect(page.getByLabel("مبلغ", { exact: true })).toHaveValue("2,500,000")
    await page.getByRole("radio", { name: "بله" }).click()
    await page.getByRole("checkbox", { name: "خرید" }).click()
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByText(`فرم «${title}» ثبت شد.`)).toBeVisible()
    await expect(page).toHaveURL(/\/forms$/)
    await expect(page.getByRole("region", { name: "پیش‌نویس‌های من" }).getByText(title)).toHaveCount(0)
    await expectAccessible(page)
    expect(errors).toEqual([])
  })

  test("حذف پیش‌نویس", async ({ page }, info) => {
    const title = `پیش‌نویس حذفی ${info.project.name} ${Date.now()}`
    const id = await publishForm(page, title)
    await page.goto(`/forms/${id}/fill`)
    await page.getByLabel("عنوان", { exact: true }).fill("موقت")
    await expect(page).toHaveURL(/draft=\d+/)
    await page.getByRole("button", { name: "حذف پیش‌نویس" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف پیش‌نویس" }).click()
    await expect(page.getByText("پیش‌نویس حذف شد.")).toBeVisible()
    await expect(page).toHaveURL(/\/forms$/)
  })

  test("فرم نمونه از کیت رابط کاربری", async ({ page }, info) => {
    // فرم نمونه برای همه دیده می‌شود (داده‌ی سراسری)؛ فقط در یک اندازه
    test.skip(info.project.name !== "desktop")
    await page.goto("/ui-kit/forms")
    await page.getByRole("button", { name: "ساخت فرم نمونه" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "درخواست نمونه (کیت رابط کاربری)" })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "نوع درخواست" })).toBeVisible()
    await expectAccessible(page)
  })
})
