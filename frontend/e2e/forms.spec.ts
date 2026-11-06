import { expect, test } from "@playwright/test"

test.describe("فرم‌ها", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ui-kit/forms")
    await expect(page.getByRole("heading", { level: 1, name: "فرم‌ها" })).toBeVisible()
  })

  test("ارسال فرم خالی: خلاصه‌ی خطا با فوکوس و پیوند به فیلد", async ({ page }) => {
    await page.getByRole("button", { name: "ثبت پرونده" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toBeFocused()
    await expect(summary).toContainText("تکمیل «نام» الزامی است.")
    await summary.getByRole("link", { name: "کد ملی" }).click()
    await expect(page.getByLabel("کد ملی", { exact: true })).toBeFocused()
    await expect(page.getByLabel("کد ملی", { exact: true })).toHaveAttribute("aria-invalid", "true")
  })

  test("کد ملی و موبایل نامعتبر پیام مشخص دارند؛ ارقام فارسی پذیرفته می‌شود", async ({ page }) => {
    await page.getByLabel("کد ملی", { exact: true }).fill("۱۲۳۴۵۶۷۸۹۰")
    await page.getByLabel("موبایل", { exact: true }).focus()
    await expect(page.getByText("کد ملی معتبر نیست؛ ده رقم با رقم کنترل درست وارد کنید.")).toBeVisible()
    await expect(page.getByLabel("کد ملی", { exact: true })).toHaveValue("1234567890")
    await page.getByLabel("موبایل", { exact: true }).fill("0912")
    await page.getByLabel("ایمیل", { exact: true }).focus()
    await expect(page.getByText("شماره‌ی موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.")).toBeVisible()
    await page.getByRole("textbox", { name: "تاریخ تولد" }).fill("13701340")
    await page.getByLabel("ایمیل", { exact: true }).focus()
    await expect(page.getByText("تاریخ معتبر نیست؛ به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید.")).toBeVisible()
  })

  test("تکمیل کامل و ثبت موفق", async ({ page }) => {
    await page.getByRole("textbox", { name: "نام", exact: true }).fill("مریم")
    await page.getByLabel("نام خانوادگی", { exact: true }).fill("کریمی")
    await page.getByLabel("کد ملی", { exact: true }).fill("0084575948")
    await page.getByLabel("موبایل", { exact: true }).fill("09121234567")

    // تایپ مستقیم با ارقام فارسی؛ جداکننده‌ها خودکار گذاشته می‌شوند و روز هفته نمایش داده می‌شود.
    const birth = page.getByRole("textbox", { name: "تاریخ تولد" })
    await birth.fill("۱۳۷۰۰۶۱۵")
    await expect(birth).toHaveValue("1370/06/15")
    // انتخاب از تقویم آوان روی ماه همان تاریخ باز می‌شود.
    await page.getByRole("button", { name: "انتخاب از تقویم" }).click()
    await page.getByRole("gridcell", { name: "۱۳۷۰/۰۶/۲۰" }).click()
    await expect(birth).toHaveValue("1370/06/20")

    await page.getByLabel("واحد سازمانی", { exact: true }).click()
    await page.getByRole("option", { name: "امور مالی" }).click()
    await page.getByLabel("حقوق پایه", { exact: true }).fill("۲۵۰۰۰۰۰۰")
    await expect(page.getByLabel("حقوق پایه", { exact: true })).toHaveValue("25,000,000")
    await page.getByRole("radio", { name: "قراردادی" }).click()

    await page.getByRole("combobox", { name: "بانک" }).fill("ملت")
    await page.getByRole("option", { name: "ملت" }).click()
    await page.getByLabel("شماره‌ی شبا", { exact: true }).fill("062960000000100324200001")

    await page.getByRole("button", { name: "ثبت پرونده" }).click()
    await expect(page.getByText("پرونده‌ی «مریم کریمی» با حقوق ۲۵٬۰۰۰٬۰۰۰ تومان ثبت شد.")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "نام", exact: true })).toHaveValue("")
  })
})
