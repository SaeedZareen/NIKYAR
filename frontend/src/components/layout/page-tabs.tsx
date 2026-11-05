// زبانه‌های صفحه‌های باز (مانند نرم‌افزارهای اداری): هر صفحه در یک زبانه می‌ماند و با یک کلیک برمی‌گردید.
import * as React from "react"
import { useLocation, useNavigate } from "react-router"
import { X } from "lucide-react"
import { navigation } from "@/app/navigation"
import { cn } from "@/lib/utils"

type Tab = { key: string; path: string; title: string }
type Ctx = { setTitle: (title: string) => void }

const STORAGE_KEY = "nikyar:tabs"
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

/** عنوان اولیه‌ی زبانه از منو، تا پیش از بارگذاری صفحه هم نام درست داشته باشد. */
const NAV_TITLES = new Map(navigation.flatMap((g) => g.items.map((i) => [i.url, i.title] as const)))

/** زبانه‌ی مسیر را می‌سازد یا نشانی/عنوانش را به‌روز می‌کند؛ بدون تغییر، همان آرایه برمی‌گردد. */
function upsert(tabs: Tab[], key: string, path: string, title?: string): Tab[] {
  const i = tabs.findIndex((t) => t.key === key)
  if (i < 0) {
    const next = [...tabs, { key, path, title: title ?? NAV_TITLES.get(key) ?? "…" }]
    return next.length > MAX_TABS ? next.slice(1) : next
  }
  const t = tabs[i]
  if (t.path === path && (title === undefined || t.title === title)) return tabs
  return tabs.map((x, j) => (j === i ? { ...x, path, title: title ?? x.title } : x))
}

export function PageTabsProvider({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation()
  const [tabs, setTabs] = React.useState<Tab[]>(load)

  // هر مسیر یک زبانه؛ پارامترهای نشانی (فیلترها) داخل همان زبانه می‌مانند.
  React.useEffect(() => {
    setTabs((prev) => upsert(prev, pathname, pathname + search))
  }, [pathname, search])

  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
    } catch {
      // ذخیره‌ی زبانه‌ها اختیاری است.
    }
  }, [tabs])

  const ctx = React.useMemo<Ctx>(
    () => ({
      // اثر عنوانِ صفحه (فرزند) پیش از اثر افزودن زبانه (والد) اجرا می‌شود؛ پس اینجا هم زبانه را می‌سازیم.
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
    <nav
      ref={nav}
      aria-label="صفحه‌های باز"
      className="hidden h-9 shrink-0 items-end gap-px overflow-x-auto border-b bg-secondary px-2 [scrollbar-width:thin] md:flex"
    >
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
  )
}
