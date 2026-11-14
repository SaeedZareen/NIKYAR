import { expect, test } from "@playwright/test"
import { expectAccessible } from "./helpers"

// هویت سازمانی (6.7): تنظیمات Active Directory. رمز دوم و فراموشی گذرواژه در messaging.spec.ts (همان تنظیم سراسری درگاه پیامک، پشت سر هم).
test("تنظیمات ورود با Active Directory و آزمون اتصال", async ({ page }) => {
  await page.goto("/admin/settings?section=directory")
  const section = page.getByRole("region", { name: "ورود با Active Directory" })
  await expect(section.getByLabel("فیلتر کاربر", { exact: true })).toHaveValue("(sAMAccountName={username})")
  await expectAccessible(page)
  const test_ = page.getByRole("region", { name: "آزمون اتصال" })
  await test_.getByRole("button", { name: "آزمون اتصال", exact: true }).click()
  await expect(test_.getByRole("status")).toContainText("نشانی سرور تنظیم نشده است.")
})
