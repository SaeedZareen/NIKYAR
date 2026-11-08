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

const SPECIAL = {
  sections: [
    {
      id: "s",
      title: "تخصصی",
      columns: 2,
      fields: [
        { id: "name", type: "text", label: "نام", props: { script: "persian" } },
        { id: "price", type: "amount", label: "مبلغ" },
        { id: "sheba", type: "iban", label: "شبا" },
        { id: "plate", type: "vehicle_plate", label: "پلاک" },
        { id: "period", type: "date_range", label: "بازه" },
        { id: "hours", type: "time_range", label: "ساعت کار" },
        { id: "rate", type: "scale", label: "رضایت", props: { display: "stars" } },
        {
          id: "eval",
          type: "matrix",
          label: "ارزیابی",
          required: true,
          props: { rows: [{ value: "q", label: "کیفیت" }], columns: [{ value: "1", label: "ضعیف" }, { value: "2", label: "خوب" }] },
        },
        { id: "agree", type: "consent", label: "تعهد", required: true, props: { text: "صحت اطلاعات را تأیید می‌کنم." } },
      ],
    },
  ],
}

const SYSTEM = {
  sections: [
    {
      id: "s",
      title: "داده‌های سامانه",
      columns: 2,
      fields: [
        { id: "me", type: "submitter", label: "درخواست‌کننده", props: { items: ["name", "username"] } },
        { id: "category", type: "lookup", label: "دسته", required: true, props: { list: "form-category" } },
        { id: "unit", type: "org_unit", label: "واحد" },
        { id: "approver", type: "user", label: "تأییدکننده" },
        { id: "place", type: "region", label: "محل", required: true },
        { id: "docs", type: "attachment", label: "مدارک", props: { multiple: true, max_files: 2 } },
        { id: "receiver", type: "signature_pad", label: "امضای تحویل‌گیرنده", required: true },
      ],
    },
  ],
}

/** فرم منتشرشده‌ی یکتا برای هر آزمون، با همان API که طراح (3.4) به کار می‌برد. */
async function publishForm(page: Page, title: string, definition: object = DEFINITION): Promise<number> {
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
    { title, definition }
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

  test("فیلدهای تخصصی: به حروف، نام بانک، پلاک، بازه‌ها، ستاره، ماتریس و تعهد", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `فیلدهای تخصصی ${info.project.name} ${Date.now()}`
    const id = await publishForm(page, title, SPECIAL)
    await page.goto(`/forms/${id}/fill`)

    await page.getByLabel("نام", { exact: true }).fill("Ali")
    await page.getByLabel("نام", { exact: true }).blur()
    await expect(page.getByText("«نام» را فقط با حروف فارسی بنویسید.")).toBeVisible()
    await page.getByLabel("نام", { exact: true }).fill("علی رضایی")

    await page.getByLabel("مبلغ", { exact: true }).fill("2500000")
    await expect(page.getByText("دو میلیون و پانصد هزار ریال · ۲۵۰٬۰۰۰ تومان")).toBeVisible()
    await page.getByLabel("شبا", { exact: true }).fill("820540102680020817909002")
    await expect(page.getByText("بانک پارسیان")).toBeVisible()

    await page.getByLabel("پلاک", { exact: true }).fill("12")
    await page.getByRole("combobox", { name: "حرف پلاک" }).click()
    await page.getByRole("option", { name: "ب", exact: true }).click()
    await page.getByLabel("سه رقم پلاک").fill("345")
    await page.getByLabel("کد شهر پلاک").fill("67")

    await page.getByLabel("بازه", { exact: true }).fill("14050901")
    await page.getByLabel("بازه — تا تاریخ", { exact: true }).fill("14050903")
    await expect(page.getByText("۳ روز")).toBeVisible()
    await page.getByLabel("ساعت کار", { exact: true }).fill("0800")
    await page.getByLabel("ساعت کار — تا ساعت", { exact: true }).fill("1230")
    await expect(page.getByText("مدت: ۴ ساعت و ۳۰ دقیقه")).toBeVisible()

    await page.getByRole("radio", { name: "۴ از ۵" }).click()
    await expectAccessible(page)

    // ماتریس و تعهد الزامی‌اند
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("به همه‌ی معیارهای «ارزیابی» پاسخ دهید.")
    await expect(summary).toContainText("برای ادامه، «تعهد» را بپذیرید.")
    await page.getByRole("radio", { name: "کیفیت: خوب" }).click()
    await page.getByRole("checkbox", { name: "صحت اطلاعات را تأیید می‌کنم." }).click()
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByText(`فرم «${title}» ثبت شد.`)).toBeVisible()

    // داده‌ی ذخیره‌شده همان شکل یکسان‌شده‌ی سرور است
    const data = await page.evaluate(async (formId) => {
      const list = await fetch(`/api/forms/submissions/?form=${formId}&mine=true`).then((r) => r.json())
      return list.results[0].data
    }, id)
    expect(data).toEqual({
      name: "علی رضایی",
      price: 2500000,
      sheba: "IR820540102680020817909002",
      plate: "12ب345-67",
      period: { start: "1405/09/01", end: "1405/09/03" },
      hours: { start: "08:00", end: "12:30" },
      rate: 4,
      eval: { q: "2" },
      agree: true,
    })
    expect(errors).toEqual([])
  })

  test("داده‌های سامانه: فهرست پایه، واحد، کاربر، استان و شهر، پیوست، امضای دستی و ثبت‌کننده", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `داده‌های سامانه ${info.project.name} ${Date.now()}`
    const id = await publishForm(page, title, SYSTEM)
    await page.goto(`/forms/${id}/fill`)
    const form = page.getByRole("region", { name: "داده‌های سامانه" })
    await expect(form.getByRole("group", { name: "درخواست‌کننده" })).toContainText("admin")

    await form.getByRole("radio", { name: "مالی" }).click()
    await form.getByLabel("واحد", { exact: true }).click()
    await page.getByRole("option", { name: /امور مالی/ }).click()
    await form.getByLabel("تأییدکننده", { exact: true }).click()
    await page.getByPlaceholder("نام، نام کاربری یا موبایل").fill("hr_manager")
    await page.getByRole("option", { name: /کریمی/ }).click()

    await form.getByLabel("محل", { exact: true }).click()
    await page.getByRole("option", { name: "اصفهان", exact: true }).click()
    await form.getByRole("combobox", { name: "محل — شهر" }).click()
    await page.getByPlaceholder("جست‌وجو").fill("کاشان")
    await page.getByRole("option", { name: /^کاشان/ }).click()

    await form.locator("input[type=file]").first().setInputFiles({ name: "پیش‌فاکتور.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n" + "x".repeat(64)) })
    await expect(form.getByRole("list", { name: "پیوست‌ها" })).toContainText("پیش‌فاکتور.pdf")

    // ثبت بدون امضا
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "لطفاً این موارد" })).toContainText("«امضای تحویل‌گیرنده» را امضا کنید.")
    const pad = form.getByRole("img", { name: /محل امضا/ })
    await pad.scrollIntoViewIfNeeded()
    const box = (await pad.boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 40)
    await page.mouse.down()
    for (let i = 1; i < 15; i++) await page.mouse.move(box.x + 20 + i * 8, box.y + 40 + (i % 2) * 20)
    await page.mouse.up()
    await form.getByRole("button", { name: "ثبت امضا" }).click()
    await expect(form.getByRole("button", { name: "امضای دوباره" })).toBeVisible()
    await expectAccessible(page)

    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByText(`فرم «${title}» ثبت شد.`)).toBeVisible()
    const data = await page.evaluate(async (formId) => (await fetch(`/api/forms/submissions/?form=${formId}&mine=true`).then((r) => r.json())).results[0].data, id)
    expect(data.category).toBe("finance")
    expect(data.place).toEqual({ province: "اصفهان", city: "کاشان" })
    expect(typeof data.unit).toBe("number")
    expect(typeof data.approver).toBe("number")
    expect(data.docs).toHaveLength(1)
    expect(data.receiver).toMatch(/^[0-9a-f-]{36}$/)
    expect(data.me).toEqual({ name: "مدیر سامانه", username: "admin" })
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
