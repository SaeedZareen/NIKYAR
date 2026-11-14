// نیک‌یار نصب‌شدنی (6.8): فقط صفحه‌ی «اتصال برقرار نیست» نگه داشته می‌شود. خود سامانه و داده‌هایش همیشه از سرور
// خوانده می‌شوند (نسخه‌ی کهنه پس از به‌روزرسانی یا داده‌ی قدیمی هرگز نشان داده نمی‌شود).
const CACHE = "nikyar-offline-v1"
const OFFLINE = "/offline.html"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE, "/icons/icon-192.png"])))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  // فقط باز کردن صفحه؛ درخواست‌های API و فایل‌ها بی‌دخالت به سرور می‌روند
  if (event.request.mode !== "navigate") return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)))
})
