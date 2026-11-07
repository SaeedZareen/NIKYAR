// زبانه‌های صفحه‌های باز (مانند نرم‌افزارهای اداری): هر صفحه در یک زبانه می‌ماند و با یک کلیک برمی‌گردید.
import * as React from "react"
import { useLocation, useNavigate } from "react-router"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = { key: string; path: string; title: string }
type Ctx = { setTitle: (title: string) => void }

// نسخه در کلید: زبانه‌های ذخیره‌شده با ساختار قدیمی نادیده گرفته می‌شوند.
const STORAGE_KEY = "nikyar:tabs:v2"
const MAX_TABS = 12
const APP_NAME = "نیک‌یار"
const TabsContext = React.createContext<Ctx | null>(null)

function load(): Tab[] {
  try {
    const t = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(t) ? t : []
  } catch {
    return []
  }
}

/** زبانه را با عنوان صفحه می‌سازد یا به‌روز می‌کند؛ بدون تغییر، همان آرایه برمی‌گردد. */
function upsert(tabs: Tab[], key: string, path: string, title: string): Tab[] {
  const i = tabs.findIndex((t) => t.key === key)
  if (i < 0) {
    const next = [...tabs, { key, path, title }]
    return next.length > MAX_TABS ? next.slice(1) : next
  }
  const t = tabs[i]
  if (t.path === path && t.title === title) return tabs
  return tabs.map((x, j) => (j === i ? { ...x, path, title } : x))
}

export function PageTabsProvider({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation()
  const [tabs, setTabs] = React.useState<Tab[]>(load)

  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
    } catch {
      // ذخیره‌ی زبانه‌ها اختیاری است.
    }
  }, [tabs])

  const ctx = React.useMemo<Ctx>(
    () => ({
      // هر صفحه با اعلام عنوانش زبانه‌ی خودش را می‌سازد (مسیرهای هدایت خودکار زبانه ندارند).
      // پارامترهای نشانی (فیلترها) داخل همان زبانه می‌مانند، چون setTitle با تغییرشان دوباره اجرا می‌شود.
      setTitle: (title) => {
        document.title = `${title} · ${APP_NAME}`
        setTabs((prev) => upsert(prev, pathname, pathname + search, title))
      },
    }),
    [pathname, search]
  )

  return (
    <TabsContext.Provider value={ctx}>
      <TabStrip tabs={tabs} active={pathname} onClose={(key) => setTabs((prev) => prev.filter((t) => t.key !== key))} />
      {children}
    </TabsContext.Provider>
  )
}

/** عنوان صفحه: عنوان سند مرورگر و عنوان زبانه را تنظیم می‌کند. */
export function usePageTitle(title: string) {
  const ctx = React.useContext(TabsContext)
  React.useEffect(() => {
    ctx?.setTitle(title)
  }, [ctx, title])
}

function TabStrip({ tabs, active, onClose }: { tabs: Tab[]; active: string; onClose: (key: string) => void }) {
  const navigate = useNavigate()
  const nav = React.useRef<HTMLElement>(null)

  // زبانه‌ی فعال در دید بماند (بدون scrollIntoView که نقطه‌ی شروع Tab صفحه‌کلید را جابه‌جا می‌کند).
  React.useEffect(() => {
    const strip = nav.current
    const el = strip?.querySelector<HTMLElement>("[aria-current=page]")?.parentElement
    if (!strip || !el) return
    const s = strip.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    if (e.left < s.left) strip.scrollLeft -= s.left - e.left + 8
    else if (e.right > s.right) strip.scrollLeft += e.right - s.right + 8
  }, [active, tabs])

  const close = (tab: Tab) => {
    const i = tabs.findIndex((t) => t.key === tab.key)
    onClose(tab.key)
    if (tab.key === active) navigate((tabs[i - 1] ?? tabs[i + 1])?.path ?? "/")
  }

  if (tabs.length === 0) return null
  return (
    <div className="hidden h-9 shrink-0 items-end border-b bg-secondary md:flex">
      <ScrollButton strip={nav} direction="start" count={tabs.length} />
      <nav ref={nav} aria-label="صفحه‌های باز" className="flex h-full min-w-0 flex-1 items-end gap-px overflow-x-auto px-1 [scrollbar-width:none]">
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <div
            key={t.key}
            className={cn(
              "group flex h-8 max-w-56 shrink-0 items-center rounded-t-md border border-b-0 text-xs",
              on ? "border-border bg-background font-semibold text-foreground" : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            <button
              type="button"
              onClick={() => navigate(t.path)}
              aria-current={on ? "page" : undefined}
              className="h-full min-w-12 truncate ps-3 pe-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {t.title}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={() => close(t)}
                aria-label={`بستن زبانه‌ی ${t.title}`}
                className="me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        )
      })}
      </nav>
      <ScrollButton strip={nav} direction="end" count={tabs.length} />
    </div>
  )
}

/**
 * دکمه‌ی جابه‌جایی نوار زبانه‌ها وقتی زبانه‌ها در عرض جا نمی‌شوند (به‌جای نوار پیمایش مرورگر).
 * در راست‌به‌چپ scrollLeft از صفر (شروع) به سمت منفی (انتها) می‌رود.
 */
function ScrollButton({ strip, direction, count }: { strip: React.RefObject<HTMLElement | null>; direction: "start" | "end"; count: number }) {
  const [enabled, setEnabled] = React.useState(false)
  React.useEffect(() => {
    const el = strip.current
    if (!el) return
    const update = () => {
      const scrolled = Math.abs(el.scrollLeft)
      setEnabled(direction === "start" ? scrolled > 1 : scrolled + el.clientWidth < el.scrollWidth - 1)
    }
    // چرخ ماوس روی نوار زبانه‌ها آن را افقی جابه‌جا می‌کند.
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft -= e.deltaY
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener("scroll", update, { passive: true })
    if (direction === "start") el.addEventListener("wheel", wheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener("scroll", update)
      el.removeEventListener("wheel", wheel)
    }
  }, [strip, direction, count])

  const Icon = direction === "start" ? ChevronRight : ChevronLeft
  if (!enabled) return null
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => strip.current?.scrollBy({ left: direction === "start" ? 240 : -240, behavior: "smooth" })}
      className="mb-0.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  )
}
