import { expect, test, type Page } from "@playwright/test"
import { collectErrors, expectAccessible, isMobile } from "./helpers"

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

const GROUPS = {
  sections: [
    {
      id: "s",
      title: "درخواست خرید",
      columns: 2,
      fields: [
        {
          id: "items",
          type: "table",
          label: "اقلام",
          span: 2,
          props: {
            columns: [
              { id: "item", type: "text", label: "شرح", required: true },
              { id: "qty", type: "number", label: "تعداد" },
              { id: "price", type: "amount", label: "فی" },
            ],
          },
        },
        { id: "grand", type: "calculated", label: "جمع کل", props: { formula: { sum_of: [{ var: "items" }, "qty", "price"] }, format: "amount" } },
        {
          id: "family",
          type: "table",
          label: "افراد تحت تکفل",
          span: 2,
          props: {
            display: "cards",
            item_label: "فرد",
            card_columns: 2,
            columns: [
              { id: "fname", type: "text", label: "نام", required: true },
              { id: "fnid", type: "national_code", label: "کد ملی" },
              { id: "fdocs", type: "attachment", label: "مدارک" },
            ],
          },
        },
        { id: "phones", type: "table", label: "شماره‌های تماس", props: { display: "list", item_label: "شماره", columns: [{ id: "phone", type: "mobile", label: "موبایل" }] } },
      ],
    },
  ],
}

/** فرم منتشرشده‌ی یکتا برای هر آزمون، با همان API که طراح (3.4) به کار می‌برد. */
async function publishForm(page: Page, title: string, definition: object = DEFINITION, settings: object = {}): Promise<number> {
  await page.goto("/forms")
  return page.evaluate(
    async ({ title, definition, settings }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const call = (url: string, method: string, body?: unknown) =>
        fetch(url, { method, headers: { "X-CSRFToken": token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json())
      const code = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const form = await call("/api/forms/", "POST", { code, title, fill_by_everyone: true, ...settings })
      await call(`/api/forms/versions/${form.draft_version}/`, "PATCH", { definition })
      await call(`/api/forms/versions/${form.draft_version}/publish/`, "POST")
      return form.id as number
    },
    { title, definition, settings }
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

  test("گروه تکرارشونده: جدول با جمع، کارت، فهرست ساده، جابه‌جایی و خطای هر مورد", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `گروه ${info.project.name} ${Date.now()}`
    const id = await publishForm(page, title, GROUPS)
    await page.goto(`/forms/${id}/fill`)
    // خانه‌ی جدول: روی موبایل جدول کارتی می‌شود
    const fa = (n: number) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
    const cell = (n: number, label: string) =>
      isMobile(page)
        ? page.getByRole("group", { name: `ردیف ${fa(n)}`, exact: true }).getByLabel(label, { exact: true })
        : page.getByLabel(`${label} ردیف ${fa(n)}`, { exact: true })

    await cell(1, "شرح").fill("کاغذ")
    await cell(1, "تعداد").fill("2")
    await cell(1, "فی").fill("1500")
    await page.getByRole("button", { name: "افزودن ردیف" }).click()
    await cell(2, "تعداد").fill("3")
    await cell(2, "فی").fill("1000")
    await expect(page.getByRole("group", { name: "جمع کل" })).toContainText(/۶.?۰۰۰ ریال/)
    // ردیف خالی نادیده گرفته می‌شود
    await page.getByRole("button", { name: "افزودن ردیف" }).click()

    const card = page.getByRole("group", { name: "فرد ۱", exact: true })
    await card.getByLabel("نام", { exact: true }).fill("سارا")
    await page.getByRole("button", { name: "افزودن فرد" }).click()
    await expect(page.getByRole("group", { name: "فرد ۲", exact: true })).toBeVisible()

    await page.getByLabel("موبایل ۱", { exact: true }).fill("09121234567")
    await page.getByRole("button", { name: "افزودن شماره" }).click()
    await page.getByLabel("موبایل ۲", { exact: true }).fill("0912")
    await page.getByLabel("موبایل ۲", { exact: true }).blur()
    await expect(page.getByText("شماره ۲: «موبایل» باید ۱۱ رقم باشد و با ۰۹ شروع شود.")).toBeVisible()

    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("ردیف ۲: تکمیل «شرح» الزامی است.")
    await expect(summary).toContainText("شماره ۲:")
    await expectAccessible(page)

    await cell(2, "شرح").fill("خودکار")
    await page.getByRole("button", { name: "حذف شماره ۲" }).click()
    // جابه‌جایی: «خودکار» ردیف اول می‌شود
    await page.getByRole("button", { name: "پایین بردن ردیف ۱" }).click()
    await expect(cell(1, "شرح")).toHaveValue("خودکار")
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByText(`فرم «${title}» ثبت شد.`)).toBeVisible()
    expect(errors).toEqual([])
  })

  test("وب و رسانه: متن قالب‌دار، تصویر، فایل راهنما، پیوند، متن غنی، بارکد، موقعیت، صدا و فیلد پنهان", async ({ page }, info) => {
    test.slow()
    const errors = collectErrors(page)
    const title = `رسانه ${info.project.name} ${Date.now()}`
    await page.goto("/forms")
    // تصویر و فایل راهنمای تعریف با همان بارگذاری طراح
    const [image, guide] = await page.evaluate(async () => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0))
      const send = async (name: string, bytes: BlobPart) => {
        const body = new FormData()
        body.append("file", new File([bytes], name))
        const r = await fetch("/api/files/", { method: "POST", headers: { "X-CSRFToken": token }, body })
        return (await r.json()).id as string
      }
      return [await send("chart.png", png), await send("contract.pdf", "%PDF-1.7\n" + "x".repeat(64))]
    })
    const id = await publishForm(page, title, {
      sections: [
        {
          id: "s",
          title: "درخواست",
          columns: 2,
          fields: [
            { id: "intro", type: "paragraph", props: { content: "<p>لطفاً <strong>با دقت</strong> پر کنید.</p>" } },
            { id: "chart", type: "image", label: "نمودار فرایند", props: { file: image, alt: "نمودار مراحل درخواست", size: "small" } },
            { id: "sample", type: "download", label: "نمونه‌ی قرارداد", props: { file: guide } },
            { id: "site", type: "url", label: "وب‌سایت" },
            { id: "desc", type: "rich_text", label: "شرح کار", required: true, span: 2 },
            { id: "code", type: "barcode", label: "بارکد کالا", props: { digits_only: true } },
            { id: "spot", type: "location", label: "محل بازدید", span: 2 },
            { id: "memo", type: "voice", label: "پیام صوتی" },
            { id: "src", type: "hidden", label: "منبع", props: { param: "src" } },
          ],
        },
      ],
    })
    await page.context().grantPermissions(["geolocation"])
    await page.context().setGeolocation({ latitude: 35.6892, longitude: 51.389, accuracy: 20 })
    await page.goto(`/forms/${id}/fill?src=sms`)

    await expect(page.locator("strong", { hasText: "با دقت" })).toBeVisible()
    await expect(page.getByRole("img", { name: "نمودار مراحل درخواست" })).toBeVisible()
    await expect(page.getByRole("link", { name: "نمونه‌ی قرارداد" })).toHaveAttribute("href", `/api/files/${guide}/download/`)

    await page.getByLabel("وب‌سایت", { exact: true }).fill("nikyar.ir")
    await page.getByLabel("بارکد کالا", { exact: true }).fill("12a")
    await page.getByLabel("بارکد کالا", { exact: true }).blur()
    await expect(page.getByText("«بارکد کالا» فقط رقم دارد.")).toBeVisible()
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("نشانی وب معتبری نیست")
    await expect(summary).toContainText("تکمیل «شرح کار» الزامی است.")

    await page.getByLabel("وب‌سایت", { exact: true }).fill("https://nikyar.ir")
    await page.getByLabel("بارکد کالا", { exact: true }).fill("6260100000011")
    const editor = page.getByRole("textbox", { name: "شرح کار" })
    await editor.click()
    await page.getByRole("button", { name: "پررنگ" }).click()
    await editor.pressSequentially("بازدید فنی")
    await page.getByRole("button", { name: "موقعیت فعلی من" }).click()
    await expect(page.getByLabel("محل بازدید — عرض جغرافیایی", { exact: true })).toHaveValue("35.689200")
    await expect(page.getByText("دقت حدود ۲۰ متر")).toBeVisible()
    await page.locator('input[type=file][accept*=".m4a"]').setInputFiles({ name: "memo.m4a", mimeType: "audio/mp4", buffer: Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from("ftypM4A "), Buffer.alloc(64)]) })
    await expect(page.getByLabel("پخش «پیام صوتی»")).toBeVisible()
    await expectAccessible(page)

    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByText(`فرم «${title}» ثبت شد.`)).toBeVisible()
    // ثبت همین فرم (آزمون‌های هم‌زمان هم با همین کاربر ثبت می‌کنند)
    const saved = await page.evaluate(async (form) => (await (await fetch(`/api/forms/submissions/?mine=true&form=${form}`)).json()).results[0].id as number, id)
    const data = await page.evaluate(async (sid) => (await (await fetch(`/api/forms/submissions/${sid}/`)).json()).data, saved)
    expect(data).toMatchObject({ site: "https://nikyar.ir", desc: "<p><strong>بازدید فنی</strong></p>", code: "6260100000011", spot: { lat: 35.6892, lng: 51.389, accuracy: 20 }, src: "sms" })
    expect(data.memo).toHaveLength(1)
    expect(errors).toEqual([])
  })

  test("فرم مرحله‌ای با بررسی هر مرحله و شماره‌ی ثبت", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `مرحله‌ای ${info.project.name} ${Date.now()}`
    const id = await publishForm(
      page,
      title,
      {
        steps: true,
        sections: [
          { id: "who", title: "متقاضی", fields: [{ id: "name", type: "text", label: "نام متقاضی", required: true }] },
          { id: "what", title: "درخواست", fields: [{ id: "need", type: "textarea", label: "شرح درخواست", required: true }] },
        ],
      },
      { number_pattern: "د-{year}-{seq:3}" }
    )
    await page.goto(`/forms/${id}/fill`)
    const steps = page.getByRole("navigation", { name: "مراحل فرم" })
    await expect(steps).toContainText("مرحله‌ی ۱ از ۲")
    await expect(page.getByLabel("شرح درخواست", { exact: true })).toHaveCount(0)
    // مرحله‌ی بعد تا پر شدن فیلد الزامی این مرحله نمی‌رود
    await page.getByRole("button", { name: "مرحله‌ی بعد" }).click()
    await expect(page.getByText("تکمیل «نام متقاضی» الزامی است.")).toBeVisible()
    await page.getByLabel("نام متقاضی", { exact: true }).fill("سارا")
    await page.getByRole("button", { name: "مرحله‌ی بعد" }).click()
    await expect(steps).toContainText("مرحله‌ی ۲ از ۲")
    await page.getByLabel("شرح درخواست", { exact: true }).fill("مرخصی")
    await page.getByRole("button", { name: "مرحله‌ی قبل" }).click()
    await expect(page.getByLabel("نام متقاضی", { exact: true })).toHaveValue("سارا")
    await page.getByRole("button", { name: "مرحله‌ی بعد" }).click()
    await expectAccessible(page)
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByText(new RegExp(`فرم «${title}» با شماره‌ی د-۱۴[۰-۹]{2}-۰۰۱ ثبت شد`))).toBeVisible()
    expect(errors).toEqual([])
  })
})
