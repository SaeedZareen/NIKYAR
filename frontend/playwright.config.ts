import { defineConfig, devices } from "@playwright/test"

// آزمون مرورگر در سه اندازه‌ی واقعی: لپ‌تاپ اداری (۱۳۶۶×۷۶۸ با بزرگ‌نمایی ۱۲۵٪)، مانیتور بزرگ و موبایل.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173"

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL, locale: "fa-IR", timezoneId: "Asia/Tehran", trace: "retain-on-failure" },
  projects: [
    { name: "laptop", use: { viewport: { width: 1093, height: 600 }, deviceScaleFactor: 1.25 } },
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx vite --port 5173 --strictPort", url: baseURL, reuseExistingServer: true },
})
