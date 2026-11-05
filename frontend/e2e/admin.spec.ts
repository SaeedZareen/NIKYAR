import { expect, test, type Page } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

/** شناسه‌ی یکتا برای هر آزمون (آزمون‌ها هم‌زمان روی یک سرور اجرا می‌شوند). */
const uid = () => Math.random().toString(36).slice(2, 7)

const rows = (page: Page) => (isMobile(page) ? page.getByRole("list", { name: "فهرست ردیف‌ها" }).getByRole("listitem") : page.locator("tbody tr"))

async function rowAction(page: Page, rowText: string, action: string) {
  await rows(page).filter({ hasText: rowText }).getByRole("button", { name: "عملیات ردیف" }).click()
  await page.getByRole("menuitem", { name: action }).click()
}

test.describe("ورود و نشست", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("بدون نشست به صفحه‌ی ورود می‌رود و پس از ورود برمی‌گردد", async ({ page }) => {
    await page.goto("/admin/users?q=ceo")
    await expect(page).toHaveURL(/\/login\?next=/)
    await page.getByLabel("نام کاربری").fill("admin")
    await page.getByLabel("گذرواژه").fill("اشتباه")
    await page.getByRole("button", { name: "ورود" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "نام کاربری یا گذرواژه درست نیست." })).toBeFocused()
    await page.getByLabel("گذرواژه").fill("nikyar123")
    await page.getByRole("button", { name: "ورود" }).click()
    await expect(page).toHaveURL(/\/admin\/users\?q=ceo$/)
    await expect(rows(page)).toHaveCount(1)
    await expectAccessible(page)
  })

  test("کاربر بدون نقش فقط پیشخوان را می‌بیند و صفحه‌ی مدیریت پیام دسترسی دارد", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("نام کاربری").fill("developer")
    await page.getByLabel("گذرواژه").fill("nikyar123")
    await page.getByRole("button", { name: "ورود" }).click()
    await expect(page.getByText("آقای حسین نوری، خوش آمدید", { exact: false })).toBeVisible()
    await expect(page.getByText("برنامه‌نویس (فناوری اطلاعات)")).toBeVisible()
    await expect(page.getByRole("link", { name: "کاربران" })).toHaveCount(0)
    await page.goto("/admin/users")
    await expect(page.getByRole("heading", { level: 1, name: "دسترسی ندارید" })).toBeVisible()
  })

  test("خروج از منوی کاربر", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("نام کاربری").fill("accountant")
    await page.getByLabel("گذرواژه").fill("nikyar123")
    await page.getByRole("button", { name: "ورود" }).click()
    await page.getByRole("button", { name: /حساب کاربری/ }).click()
    await page.getByRole("menuitem", { name: "خروج" }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto("/")
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe("کاربران", () => {
  test("فهرست با ترتیب الفبای فارسی و فیلتر نقش", async ({ page }) => {
    // کاربران نمونه (موبایل‌های ۰۹۱۲۱۰۰۰۰…)؛ آزمون‌های هم‌زمان کاربران دیگری هم می‌سازند.
    await page.goto("/admin/users?q=0912100000")
    const names = ["رضا احمدی", "محمد حسینی", "علی رضایی", "مریم کریمی", "سارا محمدی", "زهرا موسوی", "حسین نوری"]
    await expect(rows(page)).toHaveCount(names.length)
    for (const [i, name] of names.entries()) await expect(rows(page).nth(i)).toContainText(name)
    await page.getByRole("button", { name: "نقش‌ها", exact: true }).click()
    await page.getByRole("option", { name: "راهبر سامانه" }).click()
    await page.keyboard.press("Escape")
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText("علی رضایی")
  })

  test("ایجاد کاربر: خطاهای فرم، ثبت، ویرایش و غیرفعال‌کردن", async ({ page }) => {
    const id = uid()
    await page.goto("/admin/users")
    await page.getByRole("button", { name: "کاربر جدید" }).click()
    const sheet = page.getByRole("dialog", { name: "کاربر جدید" })
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })).toBeFocused()

    await sheet.getByRole("textbox", { name: "نام", exact: true }).fill("نیلوفر")
    await sheet.getByRole("textbox", { name: "نام خانوادگی" }).fill(`آزمون${id}`)
    await sheet.getByRole("textbox", { name: "نام کاربری" }).fill("admin")
    await sheet.getByRole("textbox", { name: "موبایل" }).fill("۰۹۱۲۳۴۵۶۷۸۹")
    await sheet.getByRole("textbox", { name: "گذرواژه" }).fill("Strong-Pass-1")
    await sheet.getByRole("checkbox", { name: "مدیران" }).click()
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    // نام کاربری تکراری: خطای سرور زیر همان فیلد
    await expect(sheet.getByText("این نام کاربری قبلاً برای کاربر دیگری ثبت شده است.").first()).toBeVisible()

    await sheet.getByRole("textbox", { name: "نام کاربری" }).fill(`user_${id}`)
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText(`کاربر «نیلوفر آزمون${id}» ایجاد شد.`)).toBeVisible()

    await page.getByRole("searchbox").fill(`user_${id}`)
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText("مدیران")

    await rowAction(page, `آزمون${id}`, "غیرفعال‌کردن")
    await page.getByRole("alertdialog").getByRole("button", { name: "غیرفعال‌کردن" }).click()
    await expect(rows(page).first()).toContainText("غیرفعال")
  })
})

test.describe("نقش‌ها", () => {
  test("ایجاد نقش با انتخاب همه‌ی مجوزهای یک گروه", async ({ page }) => {
    const name = `ناظر ${uid()}`
    await page.goto("/admin/roles")
    await page.getByRole("button", { name: "نقش جدید" }).click()
    const sheet = page.getByRole("dialog", { name: "نقش جدید" })
    await sheet.getByRole("textbox", { name: "عنوان نقش" }).fill(name)
    await sheet.getByRole("checkbox", { name: "همه‌ی مجوزهای ساختار سازمانی" }).click()
    await expect(sheet.getByRole("checkbox", { name: "تعریف واحدها، سمت‌ها و انتصاب‌ها" })).toBeChecked()
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText(`نقش «${name}» ایجاد شد.`)).toBeVisible()
    await expect(rows(page).filter({ hasText: name })).toContainText("۲")
  })
})

test.describe("ساختار سازمانی", () => {
  test("سمت جدید، انتصاب با جست‌وجوی کاربر و پایان انتصاب", async ({ page }) => {
    const title = `کارشناس بودجه ${uid()}`
    await page.goto("/admin/org")
    await page.getByRole("navigation", { name: "درخت واحدهای سازمانی" }).getByRole("button", { name: /^امور مالی/ }).click()
    await expect(page.getByRole("heading", { level: 2, name: "امور مالی" })).toBeVisible()

    await page.getByRole("button", { name: "سمت جدید" }).click()
    const sheet = page.getByRole("dialog")
    await sheet.getByRole("textbox", { name: "عنوان سمت" }).fill(title)
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText(`سمت «${title}» ایجاد شد.`)).toBeVisible()

    await rowAction(page, title, "انتصاب فرد")
    const assign = page.getByRole("dialog")
    await assign.getByRole("combobox", { name: "کاربر" }).click()
    await page.getByPlaceholder("نام، نام کاربری یا موبایل").fill("developer")
    await page.getByRole("option", { name: /حسین نوری/ }).click()
    await assign.getByRole("button", { name: "انتصاب" }).click()
    await expect(page.getByText(`«حسین نوری» در سمت «${title}» منصوب شد.`)).toBeVisible()

    const row = rows(page).filter({ hasText: title })
    await row.getByRole("button", { name: "پایان انتصاب حسین نوری" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "پایان انتصاب" }).click()
    await expect(row).toContainText("بدون متصدی")
  })

  test("واحد را نمی‌توان زیرمجموعه‌ی خودش کرد", async ({ page }) => {
    await page.goto("/admin/org")
    await page.getByRole("navigation", { name: "درخت واحدهای سازمانی" }).getByRole("button", { name: /^مدیریت عامل/ }).click()
    await page.getByRole("button", { name: "ویرایش", exact: true }).click()
    const sheet = page.getByRole("dialog")
    await sheet.getByRole("combobox", { name: "واحد بالادست" }).click()
    await page.getByRole("option", { name: "امور مالی" }).click()
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(sheet.getByText("واحد نمی‌تواند زیرمجموعه‌ی خودش یا زیرمجموعه‌هایش باشد.", { exact: true })).toBeVisible()
  })
})

test.describe("فهرست‌های پایه و سوابق", () => {
  test("فهرست سیستمی قفل است", async ({ page }) => {
    await page.goto("/admin/lookups?list=gender")
    await expect(page.getByText("این فهرست سیستمی و قفل است")).toBeVisible()
    await expect(page.getByRole("button", { name: "مقدار جدید" })).toHaveCount(0)
  })

  test("افزودن مقدار به فهرست و دیدن آن در سوابق تغییرات", async ({ page }) => {
    const title = `بانک آزمون ${uid()}`
    await page.goto("/admin/lookups?list=bank")
    await page.getByRole("button", { name: "مقدار جدید" }).click()
    await page.getByRole("dialog").getByRole("textbox", { name: "عنوان" }).fill(title)
    await page.getByRole("dialog").getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText(`«${title}» به فهرست اضافه شد.`)).toBeVisible()
    await expect(rows(page).filter({ hasText: title })).toHaveCount(1)

    await page.goto("/admin/audit")
    await page.getByRole("searchbox").fill(title)
    await expect(rows(page)).toHaveCount(1)
    await rows(page).first().getByRole("button", { name: /جزئیات تغییرات/ }).click()
    const detail = page.getByRole("dialog")
    await expect(detail).toContainText("ایجاد")
    await expect(detail).toContainText(title)
  })
})
