// نیک‌یار نصب‌شدنی (6.8): ثبت کارگر سرویس (فقط صفحه‌ی «اتصال برقرار نیست»؛ public/sw.js) و پیشنهاد نصب مرورگر.
import * as React from "react"

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** فقط در ساخت نهایی و روی اتصال امن (HTTPS یا localhost)؛ مرورگرها کارگر سرویس را جای دیگر نمی‌پذیرند. */
export function registerPwa() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // بی کارگر سرویس، سامانه همچنان کار می‌کند؛ فقط صفحه‌ی بی‌اتصال و نصب در دسترس نیست
    })
  })
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferred = event as InstallPrompt
    notify()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    notify()
  })
}

/** پیشنهاد نصب مرورگر (Chrome و Edge)، اگر هنوز نصب نشده؛ null یعنی دکمه‌ی نصب نشان داده نشود. */
export function useInstallPrompt(): (() => void) | null {
  const available = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => deferred !== null
  )
  if (!available) return null
  return () => {
    const prompt = deferred
    deferred = null
    notify()
    void prompt?.prompt()
  }
}
