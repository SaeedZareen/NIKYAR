import * as React from "react"
import { useBlocker } from "react-router"
import { ConfirmDialog } from "@/components/confirm-dialog"

/**
 * هشدار خروج با تغییرهای ذخیره‌نشده: رفتن به صفحه یا بخش دیگر (منو، زبانه، دکمه‌ی بازگشت)
 * پنجره‌ی تأیید باز می‌کند؛ بستن یا بازخوانی مرورگر هم هشدار مرورگر را نشان می‌دهد.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
  )

  React.useEffect(() => {
    if (!when) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [when])

  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      onOpenChange={(open) => !open && blocker.reset?.()}
      title="تغییرها ذخیره نشده‌اند"
      description="اگر خارج شوید، تغییرهایی که ذخیره نکرده‌اید از دست می‌رود."
      confirmLabel="خروج بدون ذخیره"
      destructive
      onConfirm={async () => blocker.proceed?.()}
    />
  )
}
