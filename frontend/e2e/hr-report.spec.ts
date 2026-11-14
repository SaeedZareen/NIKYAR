import { expect, test } from "@playwright/test"
import { collectErrors, expectAccessible } from "./helpers"

// گزارش نیروی انسانی و ابزارک پیشخوان (5.10).

test("گزارش نیروی انسانی با تفکیک‌ها، ورود و خروج و مدارک؛ ابزارک پیشخوان", async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto("/")
  const card = page.getByRole("region", { name: "نیروی انسانی" })
  await expect(card.getByRole("link", { name: /کارکنان شاغل/ })).toBeVisible()
  await expectAccessible(page)

  await card.getByRole("link", { name: /مدارک رو به پایان اعتبار/ }).click()
  await expect(page.getByRole("heading", { level: 1, name: "گزارش نیروی انسانی" })).toBeVisible()
  await expect(page.getByRole("region", { name: "خلاصه" })).toContainText("کارکنان شاغل")
  await expect(page.getByRole("region", { name: "کارکنان شاغل به تفکیک واحد" })).toBeVisible()
  await expectAccessible(page)

  await page.getByRole("tab", { name: "گروه سنی" }).click()
  await expect(page.getByRole("region", { name: "کارکنان شاغل به تفکیک گروه سنی" })).toBeVisible()
  await page.getByRole("tab", { name: "ورود و خروج" }).click()
  await expect(page.getByRole("region", { name: "ورود و خروج هر ماه" })).toBeVisible()
  await page.getByRole("tab", { name: "مدارک" }).click()
  await expect(page.getByText(/مدرکی رو به پایان اعتبار نیست|روز (مانده|گذشته)|امروز پایان/).first()).toBeVisible()
  await expectAccessible(page)
  expect(errors).toEqual([])
})
