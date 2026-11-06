import { expect, test } from "@playwright/test"

// پس از همه‌ی آزمون‌ها و به‌تنهایی اجرا می‌شود (پروژه‌ی restore در playwright.config.ts).
test("پشتیبان، افزودن کاربر، بازیابی: کاربر افزوده‌شده ناپدید می‌شود", async ({ page }) => {
  await page.goto("/admin/backups")
  await page.getByRole("button", { name: "پشتیبان‌گیری اکنون" }).click()
  await expect(page.getByText(/پشتیبان کامل ساخته شد/)).toBeVisible()

  const username = `restore_${Date.now()}`
  const created = await page.evaluate(async (username) => {
    const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
    const r = await fetch("/api/auth/users/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": token },
      body: JSON.stringify({ username, first_name: "پس", last_name: "از پشتیبان", password: "Restore-1234!" }),
    })
    return r.status
  }, username)
  expect(created).toBe(201)

  await page.goto("/admin/backups")
  await page.locator("tbody tr").filter({ hasText: "دستی" }).first().getByRole("button", { name: "عملیات ردیف" }).click()
  await page.getByRole("menuitem", { name: "بازیابی" }).click()
  const dialog = page.getByRole("alertdialog")
  const label = await dialog.getByText(/برای تأیید، «.+» را بنویسید:/).textContent()
  await dialog.getByRole("textbox").fill(label!.match(/«(.+)»/)![1])
  await dialog.getByRole("button", { name: "بازیابی" }).click()
  const done = page.getByRole("alertdialog", { name: "بازیابی انجام شد" })
  await expect(done).toContainText("پیش از بازیابی")
  await done.getByRole("button", { name: "بارگذاری دوباره" }).click()

  await page.goto(`/admin/users?q=${username}`)
  await expect(page.getByText("هنوز کاربری تعریف نشده است").or(page.getByText("نتیجه‌ای پیدا نشد"))).toBeVisible()
  await page.goto("/admin/backups")
  await expect(page.locator("tbody tr").filter({ hasText: "پیش از بازیابی" })).toHaveCount(1)
})
