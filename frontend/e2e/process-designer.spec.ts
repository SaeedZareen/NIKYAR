import { expect, test, type Page } from "@playwright/test"
import { collectErrors, expectAccessible, isMobile } from "./helpers"

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

/** فرم منتشرشده‌ی یکتا برای فرم اصلی فرایند. */
async function publishedForm(page: Page, title: string) {
  await page.goto("/forms")
  const code = `wf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const form = await call(page, "POST", "/api/forms/", { code, title, fill_by_everyone: true })
  const definition = { sections: [{ id: "s", fields: [{ id: "subject", type: "text", label: "موضوع", required: true }] }] }
  await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition })
  await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
  return form as { id: number }
}

const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

test.describe("فرایندساز", () => {
  test("فرایند تازه، افزودن مرحله روی بوم، ایراد زنده، واگرد و انتشار", async ({ page }, info) => {
    test.skip(isMobile(page), "طراحی روی رایانه؛ موبایل در آزمون بعد")
    const errors = collectErrors(page)
    const formTitle = `فرم فرایند ${info.project.name} ${Date.now()}`
    await publishedForm(page, formTitle)
    const title = `فرایند آزمون ${info.project.name} ${Date.now()}`

    await page.goto("/workflow/design")
    await expect(page.getByRole("heading", { level: 1, name: "طراحی فرایندها" })).toBeVisible()
    await page.getByRole("button", { name: "فرایند جدید" }).click()
    const sheet = page.getByRole("dialog", { name: "فرایند جدید" })
    await sheet.getByLabel("عنوان", { exact: true }).fill(title)
    await sheet.getByLabel("شناسه", { exact: true }).fill(unique("p"))
    await sheet.getByRole("combobox", { name: "فرم اصلی" }).click()
    await page.getByRole("option", { name: formTitle }).click()
    await sheet.getByRole("button", { name: "ذخیره" }).click()

    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
    const canvas = page.getByRole("region", { name: "بوم فرایند" })
    await expect(canvas.locator('[data-element-id="StartEvent_1"]')).toBeVisible()
    const problems = page.getByRole("region", { name: "ایرادهای انتشار" })
    await expect(problems).toContainText("ایرادی نیست")
    await expectAccessible(page)

    // افزودن کار کاربری از منوی کنار رویداد شروع (برچسب‌ها فارسی‌اند)
    await canvas.locator('[data-element-id="StartEvent_1"]').click()
    await canvas.locator('.djs-context-pad [title="افزودن کار کاربری"]').click()
    await expect(canvas.locator('[data-element-id^="Activity_"]')).toHaveCount(1)
    await expect(problems).toContainText("کار کاربری بی‌عنوان")
    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    await expect(page.getByRole("button", { name: "انتشار" })).toBeDisabled()
    // فقط عنصرهای پشتیبانی‌شده در نوار ابزار
    const palette = canvas.locator(".djs-palette")
    await expect(palette.getByRole("button", { name: "کار کاربری (مرحله‌ای که کسی انجام می‌دهد)" })).toBeVisible()
    await expect(palette.getByRole("button", { name: "دروازه‌ی موازی (همه‌ی مسیرها)" })).toBeVisible()
    await expect(canvas.locator(".djs-palette .bpmn-icon-subprocess-expanded")).toHaveCount(0)

    // زدن ایراد، عنصر را برمی‌گزیند؛ واگرد آن را برمی‌دارد و ذخیره می‌شود
    await problems.getByRole("button").first().click()
    await page.getByRole("button", { name: "واگرد (Ctrl+Z)" }).click()
    await expect(canvas.locator('[data-element-id^="Activity_"]')).toHaveCount(0)
    await expect(problems).toContainText("ایرادی نیست")

    await page.getByRole("button", { name: "انتشار" }).click()
    await expect(page.getByText("نسخه‌ی ۱ منتشر شد", { exact: false })).toBeVisible()
    await expect(page.getByRole("button", { name: "ویرایش فرایند" })).toBeVisible()
    await expect(page.getByRole("region", { name: "نمودار فقط‌خواندنی" })).toBeVisible()
    await expectAccessible(page)
    expect(errors).toEqual([])
  })

  test("مرحله‌ی زمان‌بندی: افزودن از منوی کنار عنصر و تعیین زمان انتظار", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "پانل ویژگی‌ها کنار بوم (صفحه‌ی پهن)")
    const errors = collectErrors(page)
    const form = await publishedForm(page, `فرم زمان‌بندی ${Date.now()}`)
    const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("t"), title: `زمان‌بندی ${Date.now()}`, form: form.id })
    await page.goto(`/workflow/design/${process.id}`)
    const canvas = page.getByRole("region", { name: "بوم فرایند" })
    const problems = page.getByRole("region", { name: "ایرادهای انتشار" })
    await canvas.locator('[data-element-id="StartEvent_1"]').click()
    await canvas.locator('.djs-context-pad [title="افزودن مرحله‌ی زمان‌بندی"]').click()
    const panel = page.getByRole("region", { name: "ویژگی‌ها" })
    await expect(panel.getByText("مرحله‌ی زمان‌بندی", { exact: true })).toBeVisible()
    await panel.getByLabel("عنوان", { exact: true }).fill("صبر دو روز")
    await panel.getByLabel("عنوان", { exact: true }).press("Enter")
    await panel.getByLabel("صبر تا", { exact: true }).click()
    await page.getByRole("option", { name: "گذشتن چند روز یا ساعت کاری" }).click()
    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    // تنها ایراد باقی، وصل نبودن مسیر خروجی است؛ زمان رویداد «wait_until» و ویژگی wait در فایل
    await expect(problems).toContainText("هیچ مسیری بیرون نمی‌رود")
    await expect(problems).toContainText("۱ ایراد")
    const version = await call(page, "GET", `/api/workflow/versions/${process.draft_version}/`)
    expect(version.bpmn).toContain("wait_until")
    expect(version.bpmn).toContain('name="wait"')
    expect(errors).toEqual([])
  })

  test("اقدام «ثبت در فرم دیگر» با نگاشت فیلدها", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "پانل ویژگی‌ها کنار بوم (صفحه‌ی پهن)")
    const errors = collectErrors(page)
    const target = `اموال ${Date.now()}`
    await publishedForm(page, target)
    const main = await publishedForm(page, `فرم اصلی ${Date.now()}`)
    const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("c"), title: `ثبت اموال ${Date.now()}`, form: main.id })
    await page.goto(`/workflow/design/${process.id}`)
    const canvas = page.getByRole("region", { name: "بوم فرایند" })
    await canvas.locator('[data-element-id="StartEvent_1"]').click()
    await canvas.locator('.djs-context-pad [title="افزودن اقدام خودکار"]').click()
    const panel = page.getByRole("region", { name: "ویژگی‌ها" })
    await panel.getByLabel("اقدام", { exact: true }).click()
    await page.getByRole("option", { name: "ثبت در فرم دیگر" }).click()
    await panel.getByLabel("فرم مقصد", { exact: true }).click()
    await page.getByRole("option", { name: target }).click()
    await panel.getByLabel("موضوع (الزامی)", { exact: true }).click()
    await page.getByRole("option", { name: "موضوع" }).click()
    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    const version = await call(page, "GET", `/api/workflow/versions/${process.draft_version}/`)
    expect(version.bpmn).toContain("save_submission")
    await expectAccessible(page)
    expect(errors).toEqual([])
  })

  test("روی موبایل فقط نمودار دیده می‌شود", async ({ page }, info) => {
    test.skip(!isMobile(page))
    const form = await publishedForm(page, `فرم موبایل ${info.project.name} ${Date.now()}`)
    const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("m"), title: "فرایند موبایل", form: form.id })
    await page.goto(`/workflow/design/${process.id}`)
    await expect(page.getByText("روی موبایل فقط نمودار فرایند دیده می‌شود", { exact: false })).toBeVisible()
    await expect(page.getByRole("region", { name: "نمودار فقط‌خواندنی" }).locator('[data-element-id="StartEvent_1"]')).toBeVisible()
    await expect(page.getByRole("button", { name: "انتشار" })).toBeVisible()
    await expectAccessible(page)
  })
})

test.describe("پانل ویژگی‌های فرایند", () => {
  test("الگوی درخواست خرید: تعیین گیرنده، شرط مسیر، انتشار و خروجی BPMN", async ({ page }) => {
    test.skip(isMobile(page), "طراحی روی رایانه")
    const errors = collectErrors(page)
    const wide = (page.viewportSize()?.width ?? 0) >= 1280
    await page.goto("/workflow/design")
    await page.getByRole("button", { name: "الگوی درخواست خرید" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "درخواست خرید سه‌مرحله‌ای" })).toBeVisible()
    const canvas = page.getByRole("region", { name: "بوم فرایند" })
    const problems = page.getByRole("region", { name: "ایرادهای انتشار" })
    await expect(problems).toContainText("۲ ایراد")

    /** انتخاب عنصر روی بوم و باز کردن پانل ویژگی‌ها (روی لپ‌تاپ در پانل کناری). */
    const select = async (id: string) => {
      // مسیر فقط خط باریک است؛ مرکز ناحیه‌ی کلیک خط راست روی خود خط است
      await canvas.locator(`.djs-element[data-element-id="${id}"] .djs-hit`).click({ force: id.startsWith("Flow_") })
      if (!wide) await page.getByRole("button", { name: "ویژگی‌های عنصر" }).click()
      return wide ? page.getByRole("region", { name: "ویژگی‌ها" }) : page.getByRole("dialog", { name: "ویژگی‌های عنصر" })
    }
    const close = async () => {
      if (!wide) await page.keyboard.press("Escape")
    }

    for (const id of ["Task_finance", "Task_supply"]) {
      const panel = await select(id)
      await expect(panel.getByRole("alert")).toContainText("گیرنده")
      await panel.getByLabel("گیرنده", { exact: true }).click()
      await page.getByRole("option", { name: "خود درخواست‌دهنده" }).click()
      if (id === "Task_finance") {
        // مهلت دو روز کاری؛ پس از آن تصمیم خودکار (تا تصمیم انتخاب نشده، ایراد انتشار است)
        await panel.getByLabel("مهلت انجام", { exact: true }).click()
        await panel.getByLabel("پس از پایان مهلت", { exact: true }).click()
        await page.getByRole("option", { name: "تصمیم خودکار" }).click()
        await expect(panel.getByRole("alert")).toContainText("تصمیم خودکار پس از پایان مهلت")
        await panel.getByLabel("تصمیم خودکار", { exact: true }).click()
        await page.getByRole("option", { name: "تأیید" }).click()
        await expect(panel.getByRole("alert")).toHaveCount(0)
      }
      await close()
    }
    await expect(problems).toContainText("ایرادی نیست")

    // شرط مسیر «تأیید» با سازنده‌ی دیداری و عبارت موتور
    const flow = await select("Flow_3")
    await expect(flow.getByLabel("عبارت شرط", { exact: true })).toHaveValue('decision == "approve"')
    await expect(flow.getByText("تصمیم مرحله‌ی قبل").first()).toBeVisible()
    await close()

    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    await page.getByRole("button", { name: "انتشار" }).click()
    await expect(page.getByText("نسخه‌ی ۱ منتشر شد", { exact: false })).toBeVisible()

    await page.getByRole("button", { name: "نسخه‌ها" }).click()
    const sheet = page.getByRole("dialog", { name: "نسخه‌ها" })
    await expect(sheet.getByRole("list", { name: "نسخه‌های فرایند" })).toContainText("منتشرشده")
    const download = page.waitForEvent("download")
    await sheet.getByRole("button", { name: "خروجی BPMN" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^purchase(-\d+)?-v1\.bpmn$/)
    await expectAccessible(page)
    expect(errors).toEqual([])
  })
})
