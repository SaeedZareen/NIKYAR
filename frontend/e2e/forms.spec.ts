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
    await expect(page.getByLabel("کد ملی")).toBeFocused()
    await expect(page.getByLabel("کد ملی")).toHaveAttribute("aria-invalid", "true")
  })

  test("کد ملی و موبایل نامعتبر پیام مشخص دارند؛ ارقام فارسی پذیرفته می‌شود", async ({ page }) => {
    await page.getByLabel("کد ملی").fill("۱۲۳۴۵۶۷۸۹۰")
    await page.getByLabel("موبایل").focus()
    await expect(page.getByText("کد ملی معتبر نیست؛ ده رقم با رقم کنترل درست وارد کنید.")).toBeVisible()
    await expect(page.getByLabel("کد ملی")).toHaveValue("1234567890")
    await page.getByLabel("موبایل").fill("0912")
    await page.getByLabel("ایمیل").focus()
    await expect(page.getByText("شماره‌ی موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.")).toBeVisible()
  })

  test("تکمیل کامل و ثبت موفق", async ({ page }) => {
    await page.getByRole("textbox", { name: "نام", exact: true }).fill("مریم")
    await page.getByLabel("نام خانوادگی").fill("کریمی")
    await page.getByLabel("کد ملی").fill("0084575948")
    await page.getByLabel("موبایل").fill("09121234567")

    await page.getByLabel("تاریخ تولد").click()
    const calendar = page.locator("[data-slot=popover-content]")
    await calendar.getByRole("combobox").last().selectOption("1370")
    await calendar.getByRole("button", { name: /۱۵/ }).first().click()
    await expect(page.getByLabel("تاریخ تولد")).toContainText("۱۳۷۰")

    await page.getByLabel("واحد سازمانی").click()
    await page.getByRole("option", { name: "امور مالی" }).click()
    await page.getByLabel("حقوق پایه").fill("۲۵۰۰۰۰۰۰")
    await expect(page.getByLabel("حقوق پایه")).toHaveValue("25,000,000")
    await page.getByRole("radio", { name: "قراردادی" }).click()

    await page.getByLabel("بانک").fill("ملت")
    await page.getByRole("option", { name: "ملت" }).click()
    await page.getByLabel("شماره‌ی شبا").fill("062960000000100324200001")

    await page.getByRole("button", { name: "ثبت پرونده" }).click()
    await expect(page.getByText("پرونده‌ی «مریم کریمی» با حقوق ۲۵٬۰۰۰٬۰۰۰ تومان ثبت شد.")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "نام", exact: true })).toHaveValue("")
  })
})
