// آخرین کار کاربر (کلید، کلیک، لمس، پیمایش) در همه‌ی زبانه‌های همین مرورگر؛ برای «پایان نشست پس از بی‌کاری».
// هر درخواست API بی‌کاری را در سرآیند X-Nikyar-Idle به سرور می‌گوید تا تازه‌سازی خودکار صفحه نشست را باز نگه ندارد.
const KEY = "nikyar:last-input"
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const
let last = Date.now()

/** زمان آخرین کار کاربر (میلی‌ثانیه)، تازه‌ترینِ همه‌ی زبانه‌ها. */
export function lastInput(): number {
  try {
    return Math.max(last, Number(localStorage.getItem(KEY)) || 0)
  } catch {
    return last
  }
}

export function markInput() {
  last = Date.now()
  try {
    // نوشتن حداکثر هر ۵ ثانیه، نه با هر کلید
    if (last - (Number(localStorage.getItem(KEY)) || 0) > 5000) localStorage.setItem(KEY, String(last))
  } catch {
    // حافظه‌ی مرورگر در دسترس نیست؛ همین زبانه حساب می‌شود
  }
}

/** ثانیه‌های بی‌کاری برای سرآیند درخواست‌ها. */
export const idleSeconds = () => Math.max(0, Math.floor((Date.now() - lastInput()) / 1000))

export function trackActivity() {
  for (const e of EVENTS) window.addEventListener(e, markInput, { capture: true, passive: true })
}
