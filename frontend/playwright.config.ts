import { defineConfig, devices } from "@playwright/test"

// آزمون مرورگر در سه اندازه‌ی واقعی: لپ‌تاپ اداری (۱۳۶۶×۷۶۸ با بزرگ‌نمایی ۱۲۵٪)، مانیتور بزرگ و موبایل.
// سرور جنگوی جداگانه با پایگاه داده‌ی تازه (e2e/start-backend.mjs) و Vite متصل به آن.
const apiPort = 8100
const webPort = 5174
const baseURL = `http://localhost:${webPort}`
const ADMIN_STATE = "e2e/.auth/admin.json"

const device = {
  laptop: { viewport: { width: 1093, height: 600 }, deviceScaleFactor: 1.25 },
  desktop: { viewport: { width: 1920, height: 1080 } },
  mobile: devices["Pixel 7"],
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  // حرکت کاهش‌یافته: بررسی دسترس‌پذیری وسط پویانمایی‌ها (رنگ نیمه‌شفاف) خطای کاذب نمی‌دهد.
  use: { baseURL, locale: "fa-IR", timezoneId: "Asia/Tehran", reducedMotion: "reduce", trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    ...Object.entries(device).map(([name, use]) => ({
      name,
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /restore\.spec\.ts/],
      use: { ...use, storageState: ADMIN_STATE },
    })),
    // بازیابی پشتیبان همه‌ی داده‌ها را جایگزین می‌کند؛ پس از پایان بقیه‌ی آزمون‌ها و به‌تنهایی اجرا می‌شود.
    { name: "restore", testMatch: /restore\.spec\.ts/, dependencies: Object.keys(device), use: { ...device.desktop, storageState: ADMIN_STATE } },
  ],
  webServer: [
    { command: "node e2e/start-backend.mjs", url: `http://127.0.0.1:${apiPort}/api/health/`, reuseExistingServer: false, timeout: 120_000 },
    {
      command: `npx vite --port ${webPort} --strictPort`,
      url: baseURL,
      reuseExistingServer: false,
      env: { NIKYAR_API: `http://127.0.0.1:${apiPort}` },
    },
  ],
})
