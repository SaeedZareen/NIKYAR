import * as React from "react"
import { Outlet, useLocation, useNavigationType } from "react-router"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { LicenseBanner } from "./license-banner"
import { PageTabsProvider } from "./page-tabs"

/**
 * منوی کناری: اگر کاربر قبلاً باز/بسته‌اش کرده (کوکی shadcn)، همان؛ وگرنه روی صفحه‌های کمتر از ۱۲۸۰px
 * (مثل لپ‌تاپ ۱۳۶۶ با بزرگ‌نمایی ۱۲۵٪) جمع‌شده شروع می‌شود تا محتوا و جدول‌ها جا شوند.
 */
function initialSidebarOpen() {
  const saved = document.cookie.match(/(?:^|; )sidebar_state=(true|false)/)
  return saved ? saved[1] === "true" : window.innerWidth >= 1280
}

/** پوسته‌ی برنامه: نوار بالا، منوی کناری راست، زبانه‌های صفحه‌های باز و محتوای صفحه. */
export function AppShell() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const main = React.useRef<HTMLElement>(null)
  const previous = React.useRef(pathname)
  const [sidebarOpen] = React.useState(initialSidebarOpen)

  // پس از رفتن به صفحه‌ی دیگر، فوکوس به محتوای اصلی می‌رود تا صفحه‌خوان صفحه‌ی جدید را اعلام کند.
  // تغییر مسیرِ جایگزین (مثل هدایت خودکار صفحه‌ی اول) پیمایش کاربر نیست و فوکوس را جابه‌جا نمی‌کند.
  React.useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    if (navigationType === "REPLACE") return
    main.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [pathname, navigationType])

  return (
    <div className="[--header-height:2.75rem]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-2"
      >
        پرش به محتوای اصلی
      </a>
      <SidebarProvider defaultOpen={sidebarOpen} className="flex-col">
        <AppHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <PageTabsProvider>
              <main id="main" ref={main} tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-4 p-3 outline-none md:p-4">
                <LicenseBanner />
                <Outlet />
              </main>
            </PageTabsProvider>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
