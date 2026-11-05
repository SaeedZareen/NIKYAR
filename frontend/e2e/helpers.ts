import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

/** خطاهای کنسول و صفحه را جمع می‌کند تا در پایان هر آزمون بررسی شود. */
export function collectErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  return errors
}

/** بررسی دسترس‌پذیری با axe؛ هیچ خطای جدی یا بحرانی مجاز نیست. */
export async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa", "best-practice"]).analyze()
  const serious = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([])
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
