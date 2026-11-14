import { expect, test, type Browser, type Page } from "@playwright/test"
import { expectAccessible, isMobile } from "./helpers"

// امنیت ورود (6.5): گذرواژه‌ی موقت، دستگاه‌ها، قفل حساب و تنظیمات آن.
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

async function signIn(browser: Browser, page: Page, username: string, password: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() ?? undefined })
  const other = await context.newPage()
  await other.goto("/login")
  await other.getByLabel("نام کاربری", { exact: true }).fill(username)
  await other.getByLabel("گذرواژه", { exact: true }).fill(password)
  await other.getByRole("button", { name: "ورود" }).click()
  return { context, other }
}

const unique = (name: string, info: { project: { name: string } }) => `${name}_${info.project.name}_${Date.now()}`

test("گذرواژه‌ی موقت: تعیین گذرواژه‌ی تازه پیش از هر کار", async ({ page, browser }, info) => {
  const username = unique("temp", info)
  await page.goto("/")
  await adminApi(page, "POST", "/api/auth/users/", { username, first_name: "تارا", last_name: "تازه‌وارد", gender: "female", password: "Temp-Pass-123" })
  const { context, other } = await signIn(browser, page, username, "Temp-Pass-123")
  await expect(other.getByRole("heading", { level: 1, name: "تعیین گذرواژه‌ی تازه" })).toBeVisible()
  await expectAccessible(other)
  const form = other.getByRole("region", { name: "گذرواژه‌ی تازه" })
  await expect(form).toContainText("دست‌کم ۸ نویسه با حرف و رقم.")
  await form.getByLabel("گذرواژه‌ی فعلی", { exact: true }).fill("Temp-Pass-123")
  await form.getByLabel("گذرواژه‌ی جدید", { exact: true }).fill("NikyarZebraPark")
  await form.getByLabel("تکرار گذرواژه‌ی جدید", { exact: true }).fill("NikyarZebraPark")
  await form.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
  await expect(other.getByText("گذرواژه باید هم حرف و هم رقم داشته باشد.").first()).toBeVisible()
  await form.getByLabel("گذرواژه‌ی جدید", { exact: true }).fill("Mine-Pass-456")
  await form.getByLabel("تکرار گذرواژه‌ی جدید", { exact: true }).fill("Mine-Pass-456")
  await form.getByRole("button", { name: "ذخیره‌ی تغییرات" }).click()
  await expect(other.getByText("خوش آمدید", { exact: false })).toBeVisible()
  await context.close()
})

test("دستگاه‌های من: خروج از دستگاه دیگر", async ({ page, browser }, info) => {
  const username = unique("dev", info)
  await page.goto("/")
  await adminApi(page, "POST", "/api/auth/users/", { username, first_name: "داوود", last_name: "دودستگاهی", gender: "male", must_change_password: false, password: "Two-Devices-1" })
  const first = await signIn(browser, page, username, "Two-Devices-1")
  const second = await signIn(browser, page, username, "Two-Devices-1")
  await expect(second.other.getByText("خوش آمدید", { exact: false })).toBeVisible()
  await first.other.goto("/account?tab=devices")
  const devices = first.other.getByRole("region", { name: "دستگاه‌های من" })
  await expect(devices).toContainText("همین دستگاه")
  await expectAccessible(first.other)
  await devices.getByRole("button", { name: "خروج از همه‌ی دستگاه‌های دیگر" }).click()
  await expect(first.other.getByText("از همه‌ی دستگاه‌های دیگر خارج شدید.")).toBeVisible()
  await second.other.reload()
  await expect(second.other.getByRole("heading", { name: "ورود به سامانه" })).toBeVisible()
  await first.context.close()
  await second.context.close()
})

test("قفل حساب پس از تلاش‌های ناموفق و بازکردن آن در «کاربران»", async ({ page, browser }, info) => {
  const username = unique("lock", info)
  await page.goto("/")
  await adminApi(page, "POST", "/api/auth/users/", { username, first_name: "لیلا", last_name: `قفلی ${info.project.name}`, gender: "female", must_change_password: false, password: "Right-Pass-1" })
  const { context, other } = await signIn(browser, page, username, "wrong-1")
  for (let i = 0; i < 4; i++) {
    await other.getByLabel("گذرواژه", { exact: true }).fill(`wrong-${i}`)
    await other.getByRole("button", { name: "ورود" }).click()
    await expect(other.getByText(/نام کاربری یا گذرواژه درست نیست|قفل شد/).first()).toBeVisible()
  }
  await expect(other.getByText(/حساب تا .* قفل شد/).first()).toBeVisible()
  await context.close()

  await page.goto(`/admin/users?q=${username}`)
  const row = isMobile(page) ? page.getByRole("list", { name: "فهرست ردیف‌ها" }).getByRole("listitem") : page.locator("tbody tr")
  await row.filter({ hasText: username }).getByRole("button", { name: "عملیات ردیف" }).click()
  await page.getByRole("menuitem", { name: "ویرایش" }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet).toContainText("قفل است")
  await sheet.getByRole("button", { name: "بازکردن قفل" }).click()
  await expect(page.getByText("قفل حساب باز شد.")).toBeVisible()
  const again = await signIn(browser, page, username, "Right-Pass-1")
  await expect(again.other.getByText("خوش آمدید", { exact: false })).toBeVisible()
  await again.context.close()
})

test("تنظیمات امنیت ورود", async ({ page }) => {
  await page.goto("/admin/settings?section=system")
  const section = page.getByRole("region", { name: "سامانه و امنیت" })
  await expect(section.getByLabel("کمترین طول گذرواژه", { exact: true })).toHaveValue("8")
  await expect(section.getByLabel("قفل پس از تلاش ناموفق", { exact: true })).toHaveValue("5")
  await expect(section.getByLabel("پایان نشست پس از بی‌کاری", { exact: true })).toHaveValue("30")
  await expect(section.getByRole("switch", { name: "گذرواژه با حرف و رقم" })).toBeChecked()
  await expectAccessible(page)
})

test("خروج پس از بی‌کاری با هشدار و «ادامه‌ی کار»", async ({ page, browser }, info) => {
  const username = unique("idle", info)
  await page.goto("/")
  await adminApi(page, "POST", "/api/auth/users/", { username, first_name: "ایرج", last_name: "بی‌کار", gender: "male", must_change_password: false, password: "Idle-Pass-123" })
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() ?? undefined })
  const other = await context.newPage()
  await other.clock.install()
  await other.goto("/login")
  await other.getByLabel("نام کاربری", { exact: true }).fill(username)
  await other.getByLabel("گذرواژه", { exact: true }).fill("Idle-Pass-123")
  await other.getByRole("button", { name: "ورود" }).click()
  await expect(other.getByText("خوش آمدید", { exact: false })).toBeVisible()
  // پیش‌فرض ۳۰ دقیقه: یک دقیقه پیش از پایان هشدار
  await other.clock.fastForward("29:15")
  const warning = other.getByRole("alertdialog")
  await expect(warning).toContainText("به دلیل بی‌کاری از سامانه خارج می‌شوید")
  await warning.getByRole("button", { name: "ادامه‌ی کار" }).click()
  await expect(warning).toBeHidden()
  await other.clock.fastForward("29:15")
  await expect(warning).toBeVisible()
  await other.clock.fastForward("01:00")
  await expect(other.getByText("به دلیل بی‌کاری از سامانه خارج شدید؛ دوباره وارد شوید.")).toBeVisible()
  await context.close()
})
