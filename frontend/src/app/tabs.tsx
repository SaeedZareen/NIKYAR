// زبانه‌های صفحه‌های باز (مثل راهکاران): هر صفحه در یک زبانه باز می‌شود و با یک کلیک برمی‌گردید.
import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = { key: string; path: string; title: string };
type Ctx = { setTitle: (title: string) => void };

const TabsCtx = React.createContext<Ctx>({ setTitle: () => {} });
const STORE = "nikyar:tabs";
const MAX = 10;
const HOME: Tab = { key: "/", path: "/", title: "پیشخوان" };

/** کلید زبانه: مسیر بدون پارامترهای جست‌وجو (فیلترها داخل همان زبانه می‌مانند) */
const keyOf = (pathname: string) => pathname.replace(/\/print$/, "");

function load(): Tab[] {
  try {
    const t = JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Tab[];
    return Array.isArray(t) && t.length ? t : [HOME];
  } catch { return [HOME]; }
}

export function PageTabsProvider({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const [tabs, setTabs] = React.useState<Tab[]>(load);
  const key = keyOf(loc.pathname);

  React.useEffect(() => {
    setTabs((prev) => {
      const path = loc.pathname + loc.search;
      const i = prev.findIndex((t) => t.key === key);
      if (i >= 0) return prev.map((t, j) => (j === i ? { ...t, path } : t));
      const next = [...prev, { key, path, title: "…" }];
      // قدیمی‌ترین زبانه (به‌جز پیشخوان) حذف می‌شود
      return next.length > MAX ? [next[0], ...next.slice(2)] : next;
    });
  }, [key, loc.pathname, loc.search]);

  React.useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(tabs)); } catch { /* */ }
  }, [tabs]);

  const ctx = React.useMemo<Ctx>(() => ({
    setTitle: (title) => setTabs((prev) => prev.map((t) => (t.key === key && t.title !== title ? { ...t, title } : t))),
  }), [key]);

  return (
    <TabsCtx.Provider value={ctx}>
      <TabStrip tabs={tabs} active={key} onClose={(k) => setTabs((prev) => prev.filter((t) => t.key !== k))} />
      {children}
    </TabsCtx.Provider>
  );
}

export const usePageTabs = () => React.useContext(TabsCtx);

function TabStrip({ tabs, active, onClose }: { tabs: Tab[]; active: string; onClose: (key: string) => void }) {
  const navigate = useNavigate();
  const close = (t: Tab) => {
    const i = tabs.findIndex((x) => x.key === t.key);
    onClose(t.key);
    if (t.key === active) navigate(tabs[i - 1]?.path ?? "/");
  };
  return (
    <nav aria-label="صفحه‌های باز" className="hidden h-9 shrink-0 items-end gap-px overflow-x-auto border-b border-border bg-secondary px-2 md:flex">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <div key={t.key} className={cn(
            "group flex h-8 max-w-52 shrink-0 items-center rounded-t-control border border-b-0 text-sm",
            on ? "border-border bg-background font-semibold text-foreground" : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}>
            <button type="button" onClick={() => navigate(t.path)} aria-current={on ? "page" : undefined}
              className="h-full min-w-0 truncate ps-3 pe-1 text-start">
              {t.title}
            </button>
            {t.key !== "/" ? (
              <button type="button" onClick={() => close(t)} aria-label={`بستن زبانه‌ی ${t.title}`}
                className="me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-control opacity-60 hover:bg-accent hover:opacity-100">
                <X className="size-3.5" aria-hidden />
              </button>
            ) : <span className="pe-2" />}
          </div>
        );
      })}
    </nav>
  );
}
