import { existsSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, test, type Browser, type Page } from "@playwright/test"
import { expectAccessible } from "./helpers"

// همه‌ی آزمون‌های این فایل تنظیم سراسری درگاه پیامک را عوض می‌کنند یا به آن تکیه دارند: پشت سر هم، در یک کارگر
test.describe.configure({ mode: "default" })

test.describe("پیامک و ایمیل", () => {
  test("صفحه‌ی پیامک و ایمیل در همه‌ی اندازه‌ها", async ({ page }) => {
    await page.goto("/admin/settings?section=messaging")
    await expect(page.getByRole("region", { name: "گزارش ارسال‌ها" })).toBeVisible()
    await expectAccessible(page)
  })

  test("تنظیم درگاه، رمز پنهان، ارسال آزمایشی و گزارش ارسال‌ها", async ({ page }, info) => {
    // تنظیمات سراسری است؛ کل جریان فقط در یک اندازه
    test.skip(info.project.name !== "desktop")
    await page.goto("/admin/settings?section=messaging")
    const form = page.getByRole("region", { name: "پیامک و ایمیل" })
    await form.getByRole("combobox", { name: "درگاه پیامک" }).click()
    await page.getByRole("option", { name: "کاوه‌نگار" }).click()
    await form.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    const summary = page.getByRole("alert").filter({ hasText: "لطفاً این موارد را اصلاح کنید" })
    await expect(summary).toContainText("کلید درگاه پیامک را وارد کنید.")
    await expect(summary).toContainText("شماره‌ی فرستنده را وارد کنید.")

    // فیلدهای حساب هر درگاه
    await form.getByRole("combobox", { name: "درگاه پیامک" }).click()
    await page.getByRole("option", { name: "مگفا" }).click()
    await expect(form.getByLabel("نام کاربری درگاه", { exact: true })).toBeVisible()
    await expect(form.getByLabel("دامنه‌ی حساب", { exact: true })).toBeVisible()
    await expect(form.getByLabel("گذرواژه‌ی حساب درگاه", { exact: true })).toBeVisible()
    await form.getByRole("combobox", { name: "درگاه پیامک" }).click()
    await page.getByRole("option", { name: "کاوه‌نگار" }).click()
    await expect(form.getByLabel("نام کاربری درگاه", { exact: true })).toHaveCount(0)
    await form.getByLabel("کلید درگاه پیامک", { exact: true }).fill("TEST-KEY")
    await form.getByLabel("شماره‌ی فرستنده", { exact: true }).fill("10008663")
    await form.getByRole("switch", { name: "ارسال ایمیل" }).click()
    await form.getByLabel("سرور SMTP", { exact: true }).fill("smtp.example.ir")
    await form.getByLabel("نشانی فرستنده", { exact: true }).fill("noreply@example.ir")
    await form.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
    await expect(page.getByText("تنظیمات پیامک و ایمیل ذخیره شد.")).toBeVisible()
    await expect(form.getByLabel("کلید درگاه پیامک", { exact: true })).toHaveValue("••••••••")

    const tests = page.getByRole("region", { name: "ارسال آزمایشی" })
    await tests.getByRole("button", { name: "آزمون اتصال درگاه پیامک" }).click()
    await expect(tests.getByRole("status").filter({ hasText: "اتصال به درگاه برقرار است؛ اعتبار حساب: آزمایشی" })).toBeVisible()
    await tests.getByLabel("موبایل گیرنده").fill("09121112233")
    await tests.getByRole("button", { name: "پیامک آزمایشی" }).click()
    await expect(tests.getByRole("status").filter({ hasText: "پیامک آزمایشی به ۰۹۱۲۱۱۱۲۲۳۳ فرستاده شد." })).toBeVisible()
    await tests.getByLabel("ایمیل گیرنده").fill("owner@example.ir")
    await tests.getByRole("button", { name: "ایمیل آزمایشی" }).click()
    await expect(tests.getByRole("status").filter({ hasText: "ایمیل آزمایشی به owner@example.ir فرستاده شد." })).toBeVisible()

    const log = page.getByRole("region", { name: "گزارش ارسال‌ها" })
    // آزمون‌های دیگر (کد ورود) هم پیامک می‌فرستند؛ فقط همین دو ارسال
    await expect(log.locator("tbody tr").filter({ hasText: "ارسال شد" }).filter({ hasText: "owner@example.ir" }).first()).toBeVisible()
    await expect(log.locator("tbody tr").filter({ hasText: "ارسال شد" }).filter({ hasText: "پیام آزمایشی نیک‌یار: تنظیمات پیامک" }).first()).toBeVisible()
  })

  test("انتخاب کاربر برای دریافت اعلان با پیامک و ایمیل", async ({ page }) => {
    await page.goto("/notifications")
    await page.getByRole("link", { name: "دریافت با پیامک و ایمیل" }).click()
    await expect(page).toHaveURL(/\/account\?tab=notifications$/)
    const kinds = page.getByRole("region", { name: "دریافت اعلان با پیامک و ایمیل" }).getByRole("list", { name: "نوع‌های اعلان" })
    await expect(kinds).toContainText("تغییر گذرواژه")
    await expect(kinds.getByRole("switch", { name: "پیامک برای «تغییر گذرواژه»" })).toBeVisible()
    await expectAccessible(page)
  })

  test("پیامک الگویی برای یک نوع اعلان", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop")
    await page.goto("/admin/settings?section=notification-templates")
    const row = page.locator("tbody tr").filter({ hasText: "قفل شدن حساب" })
    await row.getByRole("button", { name: "عملیات ردیف" }).click()
    await page.getByRole("menuitem", { name: "ویرایش متن" }).click()
    const sheet = page.getByRole("dialog")
    await sheet.getByLabel("کد الگوی پیامک", { exact: true }).fill("123456")
    await sheet.getByRole("group", { name: "افزودن متغیر" }).getByRole("button", { name: "پایان قفل" }).click()
    await expect(sheet.getByLabel("متغیرهای الگو", { exact: true })).toHaveValue("{until}")
    await sheet.getByRole("button", { name: "ذخیره" }).click()
    await expect(page.getByText("متن اعلان «قفل شدن حساب» ذخیره شد.")).toBeVisible()
    await expect(row).toContainText("پیامک الگویی")
    await expectAccessible(page)
  })
})

// رمز دوم پیامکی و فراموشی گذرواژه (6.7): پیامک‌ها در پوشه‌ی ساختگی سرور آزمون (start-backend.mjs) نوشته و کد از همان‌جا خوانده می‌شود.
const OUTBOX = path.join(tmpdir(), "nikyar-e2e", "outbox")

async function adminApi(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: body ? JSON.stringify(body) : undefined })
      return r.status === 204 ? null : r.json()
    },
    { method, url, body }
  )
}

/** آخرین کد شش‌رقمی پیامک‌شده به این موبایل. */
async function lastCode(mobile: string, after: number) {
  let code = ""
  await expect
    .poll(() => {
      const files = (existsSync(OUTBOX) ? readdirSync(OUTBOX) : []).filter((f) => f.startsWith("sms-") && f.endsWith(`-${mobile}.json`)).sort()
      const text = files.length ? JSON.parse(readFileSync(path.join(OUTBOX, files.at(-1)!), "utf8")).text : ""
      const stamp = files.length ? Number(files.at(-1)!.slice(4, 18)) : 0
      code = stamp >= after ? ((text.match(/[۰-۹]{6}/) ?? [""])[0] as string) : ""
      return code
    })
    .not.toBe("")
  return code
}

const stamp = () => Number(new Date().toISOString().replace(/\D/g, "").slice(0, 14)) - 1

async function freshContext(browser: Browser, page: Page) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() ?? undefined })
  return { context, other: await context.newPage() }
}

const SMS = { sms_provider: "kavenegar", sms_api_key: "TEST-KEY", sms_sender: "10008663" }

test("رمز دوم پیامکی برای یک نقش", async ({ page, browser }) => {
  // تنظیمات سراسری است؛ فقط در desktop، با نقش و کاربر تازه
  test.skip(test.info().project.name !== "desktop")
  const id = Date.now()
  await page.goto("/")
  const messaging = await adminApi(page, "GET", "/api/settings/messaging/")
  await adminApi(page, "PUT", "/api/settings/messaging/", { ...messaging, ...SMS })
  const role = await adminApi(page, "POST", "/api/auth/roles/", { name: `رمز دوم ${id}`, permissions: [] })
  const mobile = `0912${String(id).slice(-7)}`
  const user = await adminApi(page, "POST", "/api/auth/users/", {
    username: `tf_${id}`,
    first_name: "تینا",
    last_name: "دومرحله‌ای",
    gender: "female",
    mobile,
    roles: [role.id],
    must_change_password: false,
    password: "Two-Factor-1",
  })
  const system = await adminApi(page, "GET", "/api/settings/system/")
  await adminApi(page, "PUT", "/api/settings/system/", { ...system, two_factor: "roles", two_factor_roles: [role.id] })
  try {
    const { context, other } = await freshContext(browser, page)
    const after = stamp()
    await other.goto("/login")
    await other.getByLabel("نام کاربری", { exact: true }).fill(`tf_${id}`)
    await other.getByLabel("گذرواژه", { exact: true }).fill("Two-Factor-1")
    await other.getByRole("button", { name: "ورود" }).click()
    await expect(other.getByRole("heading", { name: "رمز دوم" })).toBeVisible()
    await expectAccessible(other)
    await other.getByLabel("کد پیامک", { exact: true }).fill("000000")
    await other.getByRole("button", { name: "تأیید و ورود" }).click()
    await expect(other.getByText(/کد درست نیست/).first()).toBeVisible()
    await other.getByLabel("کد پیامک", { exact: true }).fill(await lastCode(mobile, after))
    await other.getByRole("button", { name: "تأیید و ورود" }).click()
    await expect(other.getByText("خوش آمدید", { exact: false })).toBeVisible()
    await context.close()
  } finally {
    await adminApi(page, "PUT", "/api/settings/system/", { ...system, two_factor: "off", two_factor_roles: [] })
    await adminApi(page, "PUT", "/api/settings/messaging/", messaging)
    await adminApi(page, "PATCH", `/api/auth/users/${user.id}/`, { is_active: false })
  }
})

test("فراموشی گذرواژه با کد پیامکی", async ({ page, browser }) => {
  test.skip(test.info().project.name !== "desktop")
  const id = Date.now()
  await page.goto("/")
  const messaging = await adminApi(page, "GET", "/api/settings/messaging/")
  await adminApi(page, "PUT", "/api/settings/messaging/", { ...messaging, ...SMS })
  const mobile = `0935${String(id).slice(-7)}`
  const user = await adminApi(page, "POST", "/api/auth/users/", {
    username: `fp_${id}`,
    first_name: "فرهاد",
    last_name: "فراموشکار",
    gender: "male",
    mobile,
    must_change_password: false,
    password: "Old-Pass-123",
  })
  const { context, other } = await freshContext(browser, page)
  await other.goto("/login")
  await other.getByRole("link", { name: "گذرواژه را فراموش کرده‌ام" }).click()
  await expect(other.getByRole("heading", { name: "فراموشی گذرواژه" })).toBeVisible()
  const after = stamp()
  await other.getByLabel("نام کاربری", { exact: true }).fill(`fp_${id}`)
  await other.getByRole("button", { name: "فرستادن کد" }).click()
  await other.getByLabel("کد پیامک", { exact: true }).fill(await lastCode(mobile, after))
  await other.getByLabel("گذرواژه‌ی جدید", { exact: true }).fill("Fresh-Pass-456")
  await other.getByLabel("تکرار گذرواژه‌ی جدید", { exact: true }).fill("Fresh-Pass-456")
  await expectAccessible(other)
  await other.getByRole("button", { name: "ثبت گذرواژه‌ی تازه" }).click()
  await expect(other.getByText("گذرواژه‌ی تازه ثبت شد؛ با آن وارد شوید.")).toBeVisible()
  await other.getByLabel("نام کاربری", { exact: true }).fill(`fp_${id}`)
  await other.getByLabel("گذرواژه", { exact: true }).fill("Fresh-Pass-456")
  await other.getByRole("button", { name: "ورود" }).click()
  await expect(other.getByText("خوش آمدید", { exact: false })).toBeVisible()
  await context.close()
  await adminApi(page, "PUT", "/api/settings/messaging/", messaging)
  await adminApi(page, "PATCH", `/api/auth/users/${user.id}/`, { is_active: false })
})
