import { expect, test, type Page } from "@playwright/test"
import { collectErrors, expectAccessible } from "./helpers"

/** افزودن از جعبه‌ابزار؛ روی صفحه‌ی باریک جعبه‌ابزار در پانل «افزودن فیلد» است. */
const narrow = (page: Page) => (page.viewportSize()?.width ?? 0) < 1280

async function addTool(page: Page, name: string) {
  if (narrow(page)) await page.getByRole("button", { name: "افزودن فیلد" }).click()
  await page.getByRole("button", { name: `افزودن «${name}»` }).click()
}

/** پانل ویژگی‌ها (روی صفحه‌ی باریک پانل کناری است و پس از کار بسته می‌شود). */
const props = (page: Page) => page.getByRole("dialog", { name: "ویژگی‌ها" }).or(page.getByRole("region", { name: "ویژگی‌ها" }))
async function closeProps(page: Page) {
  if (!narrow(page)) return
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "ویژگی‌ها" })).toBeHidden()
}

async function createForm(page: Page, title: string) {
  await page.goto("/forms/design")
  await page.getByRole("button", { name: "فرم جدید" }).click()
  await page.getByLabel("عنوان", { exact: true }).fill(title)
  await page.getByRole("button", { name: "ساخت و رفتن به طراح" }).click()
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
}

test.describe("طراح فرم", () => {
  test("ساخت فرم، ویژگی‌ها، خطای سرور، واگرد، انتشار و پر کردن", async ({ page }, info) => {
    test.slow()
    const errors = collectErrors(page)
    const title = `فرم طراحی ${info.project.name} ${Date.now()}`
    await createForm(page, title)

    await addTool(page, "متن یک‌خطی")
    await props(page).getByLabel("برچسب", { exact: true }).fill("موضوع درخواست")
    await props(page).getByLabel("الزامی", { exact: true }).click()
    // برچسب خالی: سرور تعریف را رد می‌کند و پیامش در پانل و کادر قرمز روی بوم می‌آید
    await props(page).getByLabel("برچسب", { exact: true }).fill("")
    await expect(props(page).getByText("برچسب فیلد الزامی است.")).toBeVisible()
    await expect(page.getByText(/ایراد در تعریف فرم هست/)).toBeVisible()
    await props(page).getByLabel("برچسب", { exact: true }).fill("موضوع درخواست")
    await closeProps(page)
    await expect(page.getByText(/ذخیره شد/)).toBeVisible()

    await addTool(page, "انتخاب یکی")
    await props(page).getByLabel("برچسب", { exact: true }).fill("اولویت")
    await props(page).getByLabel("گزینه‌ها ۱", { exact: true }).fill("عادی")
    await props(page).getByLabel("گزینه‌ها ۲", { exact: true }).fill("فوری")
    await closeProps(page)

    // واگرد افزودن بلوک
    await addTool(page, "اطلاعات تماس")
    await closeProps(page)
    await expect(page.getByRole("button", { name: /انتخاب «موبایل»/ })).toBeVisible()
    await page.getByRole("button", { name: /^واگرد/ }).click()
    await expect(page.getByRole("button", { name: /انتخاب «موبایل»/ })).toHaveCount(0)
    await page.getByRole("button", { name: /^ازنو/ }).click()
    await expect(page.getByRole("button", { name: /انتخاب «موبایل»/ })).toBeVisible()
    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    await expectAccessible(page)

    await page.getByRole("button", { name: "انتشار" }).click()
    await expect(page.getByText(new RegExp(`نسخه‌ی ۱ «${title}» منتشر شد`))).toBeVisible()
    await expect(page.getByRole("button", { name: "ویرایش فرم" })).toBeVisible()

    await page.goto("/forms")
    await page.getByRole("link", { name: title }).click()
    await expect(page.getByLabel("موضوع درخواست", { exact: true })).toBeVisible()
    await expect(page.getByRole("radio", { name: "فوری" })).toBeVisible()
    // تنها خطای کنسول، پاسخ ۴۰۰ ذخیره‌ی عمدی تعریف نادرست است.
    expect(errors.filter((e) => !e.includes("status of 400"))).toEqual([])
  })

  test("جابه‌جایی با صفحه‌کلید، کشیدن از جعبه‌ابزار و پیش‌نویس تازه", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "کشیدن از جعبه‌ابزار فقط وقتی جعبه‌ابزار کنار بوم است (صفحه‌ی پهن)")
    await createForm(page, `جابه‌جایی ${Date.now()}`)
    await addTool(page, "متن یک‌خطی")
    await props(page).getByLabel("برچسب", { exact: true }).fill("اول")
    await addTool(page, "عدد")
    await props(page).getByLabel("برچسب", { exact: true }).fill("دوم")

    const order = async () => (await page.getByRole("button", { name: /^انتخاب «/ }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))))
    expect(await order()).toEqual(["انتخاب «اول»", "انتخاب «دوم»"])

    // صفحه‌کلید: برداشتن «دوم» با Space و بردن به جای «اول» (در بخش دوستونه، سمت راست آن)
    await page.getByRole("button", { name: /انتخاب «دوم»/ }).click()
    await page.getByRole("button", { name: /جابه‌جایی «دوم»/ }).focus()
    // هر کلید پس از اعلام صفحه‌خوان (جابه‌جایی چند لحظه پس از Space فعال می‌شود)
    const live = page.locator("[id^=DndLiveRegion]")
    await page.keyboard.press("Space")
    await expect(live).toContainText("«دوم» روی «دوم» است.")
    await page.keyboard.press("ArrowRight")
    await expect(live).toContainText("«دوم» روی «اول» است.")
    await page.keyboard.press("Space")
    await expect.poll(order).toEqual(["انتخاب «دوم»", "انتخاب «اول»"])

    // کشیدن «متن چندخطی» از جعبه‌ابزار روی «اول»
    const tool = page.getByRole("button", { name: "افزودن «متن چندخطی»" })
    await tool.scrollIntoViewIfNeeded()
    const target = page.getByRole("button", { name: /انتخاب «اول»/ })
    const from = (await tool.boundingBox())!
    const to = (await target.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x - 40, from.y, { steps: 5 })
    await page.mouse.move(to.x + to.width / 2, to.y + 5, { steps: 10 })
    await page.mouse.up()
    await expect.poll(order).toEqual(["انتخاب «دوم»", "انتخاب «متن چندخطی»", "انتخاب «اول»"])

    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    await page.getByRole("button", { name: "انتشار" }).click()
    await page.getByRole("button", { name: "ویرایش فرم" }).click()
    await expect(page.getByText(/پیش‌نویس نسخه‌ی ۲/)).toBeVisible()
  })
})

test.describe("قاعده‌های فرم", () => {
  test("نمایش و الزام شرطی، فرمول شمار روز و اعتبارسنجی بین فیلدها", async ({ page }, info) => {
    test.slow() // طراحی کامل یک فرم و پر کردنش؛ زیر بار سه اندازه‌ی هم‌زمان بیش از ۳۰ ثانیه
    const errors = collectErrors(page)
    const title = `مرخصی با قاعده ${info.project.name} ${Date.now()}`
    await createForm(page, title)
    const panel = props(page)

    await addTool(page, "انتخاب یکی")
    await panel.getByLabel("برچسب", { exact: true }).fill("نوع مرخصی")
    await panel.getByLabel("گزینه‌ها ۱", { exact: true }).fill("استحقاقی")
    await panel.getByLabel("گزینه‌ها ۲", { exact: true }).fill("استعلاجی")
    await panel.getByLabel("الزامی", { exact: true }).click()
    await closeProps(page)
    for (const label of ["از تاریخ", "تا تاریخ"]) {
      await addTool(page, "تاریخ")
      await panel.getByLabel("برچسب", { exact: true }).fill(label)
      await closeProps(page)
    }
    await addTool(page, "محاسبه‌ای")
    await panel.getByLabel("برچسب", { exact: true }).fill("شمار روز")
    const pick = async (name: string, option: string) => {
      await panel.getByRole("combobox", { name, exact: true }).click()
      await page.getByRole("option", { name: option, exact: true }).click()
    }
    await pick("عمل", "شمار روز بین دو تاریخ (هر دو سر شامل)")
    await pick("از تاریخ", "از تاریخ")
    await pick("تا تاریخ", "تا تاریخ")
    await closeProps(page)

    await addTool(page, "متن یک‌خطی")
    await panel.getByLabel("برچسب", { exact: true }).fill("شماره‌ی گواهی پزشک")
    for (const rule of ["نمایش شرطی", "الزامی شرطی"]) {
      await panel.getByLabel(rule, { exact: true }).click()
      const editor = panel.getByRole("switch", { name: rule }).locator("xpath=ancestor::*[@data-slot='field'][1]")
      await editor.getByRole("combobox", { name: "شرط ۱: فیلد" }).click()
      await page.getByRole("option", { name: "نوع مرخصی", exact: true }).click()
      await editor.getByRole("combobox", { name: "شرط ۱: مقدار" }).click()
      await page.getByRole("option", { name: "استعلاجی", exact: true }).click()
    }
    await closeProps(page)

    // اعتبارسنجی: «تا تاریخ» بیشتر یا برابر «از تاریخ»
    await page.getByRole("button", { name: /اعتبارسنجی بین فیلدها/ }).click()
    await panel.getByRole("button", { name: "قاعده‌ی تازه" }).click()
    await panel.getByRole("combobox", { name: "شرط ۱: فیلد" }).click()
    await page.getByRole("option", { name: "تا تاریخ", exact: true }).click()
    await panel.getByRole("combobox", { name: "شرط ۱: عملگر" }).click()
    await page.getByRole("option", { name: "بیشتر یا برابر", exact: true }).click()
    await panel.getByRole("combobox", { name: "شرط ۱: نوع" }).click()
    await page.getByRole("option", { name: "فیلد دیگر", exact: true }).click()
    await panel.getByRole("combobox", { name: "شرط ۱: فیلد", exact: true }).nth(1).click()
    await page.getByRole("option", { name: "از تاریخ", exact: true }).click()
    await panel.getByLabel("پیام خطا", { exact: true }).fill("«تا تاریخ» باید بعد از «از تاریخ» باشد.")
    await panel.getByRole("combobox", { name: "نمایش پیام زیر" }).click()
    await page.getByRole("option", { name: "تا تاریخ", exact: true }).click()
    await closeProps(page)
    await expect(page.getByText(/ذخیره شد/)).toBeVisible()
    await expectAccessible(page)
    await page.getByRole("button", { name: "انتشار" }).click()
    await expect(page.getByRole("button", { name: "ویرایش فرم" })).toBeVisible()

    // پر کردن: گواهی فقط برای استعلاجی، شمار روز زنده، خطای بازه
    await page.goto("/forms")
    await page.getByRole("link", { name: title }).click()
    await expect(page.getByLabel("شماره‌ی گواهی پزشک", { exact: true })).toHaveCount(0)
    await page.getByRole("radio", { name: "استعلاجی" }).click()
    await expect(page.getByLabel("شماره‌ی گواهی پزشک", { exact: true })).toBeVisible()
    await page.getByLabel("از تاریخ", { exact: true }).fill("14050905")
    await page.getByLabel("تا تاریخ", { exact: true }).fill("14050901")
    // فرمول شمار روز زنده (هنوز بازه نادرست است)
    await expect(page.getByRole("group", { name: "شمار روز" }).getByRole("status")).toHaveText(/−۳/)
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "لطفاً این موارد" })).toContainText("تکمیل «شماره‌ی گواهی پزشک» الزامی است.")
    await page.getByLabel("شماره‌ی گواهی پزشک", { exact: true }).fill("پ-۱۲۳")
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "لطفاً این موارد" })).toContainText("«تا تاریخ» باید بعد از «از تاریخ» باشد.")
    await page.getByLabel("تا تاریخ", { exact: true }).fill("14050907")
    await expect(page.getByRole("group", { name: "شمار روز" }).getByRole("status")).toHaveText("۳")
    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await expect(page.getByText(`فرم «${title}» ثبت شد.`)).toBeVisible()
    const data = await page.evaluate(async () => (await fetch("/api/forms/submissions/?mine=true").then((r) => r.json())).results[0].data)
    expect(Object.values(data)).toContain(3)
    expect(errors.filter((e) => !e.includes("status of 400"))).toEqual([])
  })
})
