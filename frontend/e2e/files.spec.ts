import { expect, test, type Page } from "@playwright/test"
import { expectAccessible } from "./helpers"

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")

const chooseFiles = (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[], scope = page.locator("body")) =>
  scope.locator('input[type="file"]').first().setInputFiles(files)

test.describe("فایل‌ها و پیوست‌ها", () => {
  test("بارگذاری، پیش‌نمایش و حذف پیوست؛ رد نوع غیرمجاز", async ({ page }) => {
    await page.goto("/ui-kit/components")
    const demo = page.getByRole("region", { name: "پیوست‌ها" })
    await expect(demo).toContainText("حداکثر ۱۰ مگابایت")

    await chooseFiles(page, [{ name: "نامه.pdf", mimeType: "application/pdf", buffer: PDF }], demo)
    const list = demo.getByRole("list", { name: "پیوست‌ها" })
    await expect(list.getByRole("link", { name: "نامه.pdf", exact: true })).toBeVisible()

    await list.getByRole("button", { name: "پیش‌نمایش نامه.pdf" }).click()
    const preview = page.getByRole("dialog", { name: "نامه.pdf" })
    await expect(preview.locator("iframe")).toHaveAttribute("src", /download\/\?inline=1$/)
    await preview.getByRole("button", { name: "Close" }).or(preview.getByRole("button", { name: "بستن" })).first().click()

    await chooseFiles(page, [{ name: "طرح.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }], demo)
    await expect(demo.getByRole("alert")).toContainText("این نوع فایل پذیرفته نمی‌شود")
    await demo.getByRole("button", { name: "بستن پیام طرح.svg" }).click()
    await expect(demo.getByRole("alert")).toHaveCount(0)
    await expectAccessible(page)

    await list.getByRole("button", { name: "حذف نامه.pdf" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click()
    await expect(page.getByText("«نامه.pdf» حذف شد.")).toBeVisible()
    await expect(demo).toContainText("پیوستی ثبت نشده است.")
  })

  test("تنظیمات فایل‌ها: اعتبارسنجی حجم و نوع", async ({ page }) => {
    await page.goto("/admin/settings?section=files")
    const section = page.getByRole("region", { name: "فایل‌ها و پیوست‌ها" })
    await section.getByLabel("حداکثر حجم هر فایل", { exact: true }).fill("0")
    const checked = section.getByRole("checkbox", { checked: true })
    while ((await checked.count()) > 0) await checked.first().click()
    await section.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("حجم باید بین ۱ تا ۲۰۰ مگابایت باشد.")
    await expect(summary).toContainText("دست‌کم یک نوع فایل را مجاز کنید.")
    await expectAccessible(page)
  })

  test("لوگوی سازمان در نوار بالا و صفحه‌ی ورود", async ({ page, browser }, testInfo) => {
    // لوگو مقدار سراسری است؛ فقط در یک اندازه تغییر داده می‌شود تا آزمون‌های هم‌زمان تداخل نکنند.
    test.skip(testInfo.project.name !== "desktop")
    await page.goto("/admin/settings")
    const profile = page.getByRole("region", { name: "مشخصات سازمان" })
    await chooseFiles(page, [{ name: "logo.png", mimeType: "image/png", buffer: PNG }], profile)
    await expect(profile.getByRole("img", { name: "لوگوی سازمان" })).toBeVisible()
    await profile.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("مشخصات سازمان ذخیره شد.")).toBeVisible()
    const headerLogo = page.getByRole("banner").locator("img")
    await expect(headerLogo).toHaveAttribute("src", /\/api\/files\/.+\/download\/\?inline=1/)
    await expect.poll(() => headerLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)

    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const login = await anonymous.newPage()
    await login.goto("/login")
    await expect.poll(() => login.locator("img").first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
    await anonymous.close()

    await profile.getByRole("button", { name: "حذف تصویر" }).click()
    await profile.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByRole("banner").locator("img")).toHaveCount(0)
  })
})
