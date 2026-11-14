import { existsSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, test, type Browser, type Page } from "@playwright/test"
import { expectAccessible } from "./helpers"

// هویت سازمانی (6.7): رمز دوم پیامکی، فراموشی گذرواژه و تنظیمات Active Directory. پیامک‌ها در پوشه‌ی ساختگی
// سرور آزمون نوشته می‌شوند (start-backend.mjs) و کد از همان‌جا خوانده می‌شود.
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

test("تنظیمات ورود با Active Directory و آزمون اتصال", async ({ page }) => {
  await page.goto("/admin/settings?section=directory")
  const section = page.getByRole("region", { name: "ورود با Active Directory" })
  await expect(section.getByLabel("فیلتر کاربر", { exact: true })).toHaveValue("(sAMAccountName={username})")
  await expectAccessible(page)
  const test_ = page.getByRole("region", { name: "آزمون اتصال" })
  await test_.getByRole("button", { name: "آزمون اتصال", exact: true }).click()
  await expect(test_.getByRole("status")).toContainText("نشانی سرور تنظیم نشده است.")
})
