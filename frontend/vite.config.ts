import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  // بوم bpmn-js (process-canvas، حدود ۵۸۰KB) بزرگ‌ترین تکه است و جدا فقط در فرایندساز و صفحه‌ی درخواست بارگذاری می‌شود؛
  // سقف هشدار کمی بالاتر از آن است تا هشدار ساخت در update.bat مالک را نگران نکند، ولی تکه‌ی بزرگ تازه‌ای هنوز هشدار بدهد.
  build: { chunkSizeWarningLimit: 650 },
  server: {
    host: true,
    // Host درخواست حفظ می‌شود (changeOrigin: false) تا بررسی Origin در محافظت CSRF جنگو درست کار کند.
    // NIKYAR_API: نشانی سرور جنگو (آزمون مرورگر سرور جداگانه‌ی خودش را می‌دهد).
    proxy: {
      "/api": { target: process.env.NIKYAR_API ?? "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
})
