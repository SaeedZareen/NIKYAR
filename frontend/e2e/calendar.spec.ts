import { expect, test, type Page } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

// تعطیلات سراسری‌اند؛ هر اندازه روی سال جداگانه کار می‌کند تا آزمون‌های هم‌زمان تداخل نکنند.
const YEARS: Record<string, number> = { laptop: 1411, desktop: 1412, mobile: 1413 }
const fa = (v: number | string) => String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])

const rows = (page: Page) => (isMobile(page) ? page.getByRole("list", { name: "فهرست ردیف‌ها" }).getByRole("listitem") : page.locator("tbody tr"))

test.describe("تقویم کاری", () => {
  test("افزودن تعطیلات رسمی سال، تعطیلی خاص سازمان و حذف آن", async ({ page }, info) => {
    const year = YEARS[info.project.name]
    await page.goto(`/admin/calendar?year=${year}`)
    await expect(page.getByRole("region", { name: `تقویم سال ${fa(year)}` })).toBeVisible()
    await page.getByRole("button", { name: `افزودن تعطیلات رسمی ${fa(year)}` }).click()
    await expect(page.getByText("تقویم رسمی سال", { exact: false })).toBeVisible()
    await expect(page.getByText(`تعطیلات رسمی سال ${fa(year)} هنوز ثبت نشده است`)).toHaveCount(0)
    await expect(page.getByText(/نمایش ۱ تا ۱۰ از ۱۰/)).toBeVisible()
    await expectAccessible(page)

    await page.getByRole("button", { name: "تعطیلی جدید" }).click()
    const sheet = page.getByRole("dialog")
    await sheet.getByLabel("تاریخ", { exact: true }).fill(`${year}0120`)
    await sheet.getByLabel("عنوان", { exact: true }).fill("سالروز تأسیس")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText(`«سالروز تأسیس» (۲۰ فروردین ${fa(year)}) به تعطیلات اضافه شد.`)).toBeVisible()
    // همان تقویمی که همه‌ی انتخاب‌گرهای تاریخ سامانه به کار می‌برند، عنوان تعطیلی را نشان می‌دهد.
    await expect(page.getByRole("region", { name: `تقویم سال ${fa(year)}` }).locator('[title="سالروز تأسیس"]')).toHaveCount(1)

    // تاریخ تکراری
    await page.getByRole("button", { name: "تعطیلی جدید" }).click()
    await sheet.getByLabel("تاریخ", { exact: true }).fill(`${year}0120`)
    await sheet.getByLabel("عنوان", { exact: true }).fill("تکراری")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByRole("alert").first()).toContainText("این روز از قبل تعطیل ثبت شده است")
    await sheet.getByRole("button", { name: "انصراف" }).click()

    await rows(page).filter({ hasText: "سالروز تأسیس" }).getByRole("button", { name: "عملیات ردیف" }).click()
    await page.getByRole("menuitem", { name: "حذف" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click()
    await expect(page.getByText("«سالروز تأسیس» از تعطیلات حذف شد.")).toBeVisible()
    await expect(rows(page).filter({ hasText: "سالروز تأسیس" })).toHaveCount(0)
  })

  test("ورود تعطیلات از فایل CSV با گزارش خطای سطرها", async ({ page }, info) => {
    const year = YEARS[info.project.name] + 10
    await page.goto(`/admin/calendar?year=${year}`)
    await page.getByRole("button", { name: "ورود از فایل" }).click()
    const dialog = page.getByRole("dialog", { name: "ورود تعطیلات از فایل" })
    const csv = `تاریخ,عنوان,نوع\n${year}/01/01,نوروز\n${year}/07/31,نامعتبر\n${year}/03/10,جشن سازمان,خاص سازمان\n`
    await dialog.getByLabel("فایل CSV تعطیلات").setInputFiles({ name: "holidays.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
    await expect(dialog.getByRole("status")).toContainText("۲ روز اضافه و ۰ روز به‌روز شد.")
    await expect(dialog.getByRole("status")).toContainText(`سطر ۳: تاریخ «${year}/07/31» معتبر نیست.`)
    await dialog.getByRole("button", { name: "بستن" }).first().click()
    await expect(rows(page)).toHaveCount(2)
  })

  test("روزها و ساعت کاری: اعتبارسنجی و پنجشنبه‌ی نیمه‌وقت", async ({ page }, info) => {
    await page.goto("/admin/settings?section=work-week")
    const section = page.getByRole("region", { name: "روزها و ساعت کاری" })
    await expect(section.getByLabel("شروع پنجشنبه")).toBeDisabled()
    await section.getByRole("checkbox", { name: "پنجشنبه" }).click()
    await section.getByLabel("پایان پنجشنبه").fill("0700")
    await section.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toBeFocused()
    await expect(summary).toContainText("پایان پنجشنبه: ساعت پایان باید بعد از ساعت شروع باشد.")
    await expectAccessible(page)

    // ذخیره فقط در یک اندازه (تنظیم سراسری)، سپس بازگردانی
    test.skip(info.project.name !== "desktop")
    await section.getByLabel("پایان پنجشنبه").fill("1200")
    await expect(section).toContainText("۴ ساعت")
    await section.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("روزها و ساعت کاری ذخیره شد.")).toBeVisible()
    await page.goto("/admin/calendar")
    await expect(page.getByText("روزهای غیرکاری هفته: جمعه")).toBeVisible()
    await page.goto("/admin/settings?section=work-week")
    await section.getByRole("checkbox", { name: "پنجشنبه" }).click()
    await section.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("روزها و ساعت کاری ذخیره شد.")).toBeVisible()
  })
})
