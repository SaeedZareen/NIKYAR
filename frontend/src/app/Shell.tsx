// پوسته‌ی برنامه به سبک راهکاران: نوار بالای سرمه‌ای، منوی درختی سیستم‌ها در راست (جمع‌شونده)،
// زبانه‌های صفحه‌های باز، و ناحیه‌ی کار. صفحه‌های طراحی (فرم‌ساز/فرایندساز) تمام‌ارتفاع هستند.
import * as React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, KeyRound, LogOut, Menu, Monitor, Moon, PanelRightClose, PanelRightOpen, Search, Sun, UserRound } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { NotificationInbox } from "@/components/ui/notification-inbox";
import { CommandDialog, type CommandItem } from "@/components/ui/command";
import { JALALI_MONTHS, JALALI_WEEKDAYS, jalaliWeekday, toJalali } from "@/lib/jalali";
import { cn, fa } from "@/lib/utils";
import { get, post } from "./api";
import { useAuth } from "./auth";
import { MODULES, type NavGroup } from "./modules";
import { PageTabsProvider } from "./tabs";

const WORKSPACE = [/^\/forms\/[^/]+$/, /^\/processes\/[^/]+$/];

function todayLabel() {
  const d = new Date();
  const j = toJalali(d);
  return `${JALALI_WEEKDAYS[jalaliWeekday(d)]} ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
}

function readPref(key: string, def: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? def : v === "1"; } catch { return def; }
}
function writePref(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* */ }
}

function useNav(): NavGroup[] {
  const { can, moduleEnabled } = useAuth();
  const groups = new Map<string, NavGroup>();
  for (const m of MODULES) {
    if (m.code !== "core" && !moduleEnabled(m.code)) continue;
    for (const g of m.nav) {
      const items = g.items.filter((i) => can(i.perm));
      if (!items.length) continue;
      const cur = groups.get(g.title);
      if (cur) cur.items.push(...items);
      else groups.set(g.title, { ...g, items: [...items] });
    }
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

/** منوی درختی سیستم‌ها؛ در حالت جمع‌شده فقط آیکون‌ها */
function TreeNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const groups = useNav();
  const counts = useQuery({ queryKey: ["inbox-counts"], queryFn: () => get<{ open: number; overdue: number }>("/workflow/inbox/counts/"), refetchInterval: 30_000 });
  const [closed, setClosed] = React.useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("nikyar:nav-closed") ?? "{}"); } catch { return {}; }
  });
  const toggle = (t: string) => setClosed((c) => {
    const n = { ...c, [t]: !c[t] };
    try { localStorage.setItem("nikyar:nav-closed", JSON.stringify(n)); } catch { /* */ }
    return n;
  });
  const item = (it: NavGroup["items"][number]) => (
    <li key={it.to}>
      <NavLink to={it.to} end={it.end} onClick={onNavigate} title={collapsed ? it.label : undefined} aria-label={collapsed ? it.label : undefined}
        className={({ isActive }) => cn(
          "relative flex h-8 items-center gap-2.5 rounded-control text-sm transition-colors",
          collapsed ? "justify-center" : "ps-7 pe-2",
          isActive
            ? "bg-accent font-semibold text-foreground before:absolute before:inset-y-1 before:start-0 before:w-1 before:rounded-full before:bg-brand"
            : "text-foreground/85 hover:bg-row-hover hover:text-foreground",
        )}>
        <it.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {!collapsed && <span className="truncate">{it.label}</span>}
        {it.badge === "inbox" && !!counts.data?.open && (
          <span className={cn("rounded-full bg-brand px-1.5 text-xs font-semibold leading-5 text-brand-foreground", collapsed ? "absolute -top-1 end-0" : "ms-auto")}>
            {fa(counts.data.open)}<span className="sr-only"> کار در انتظار</span>
          </span>
        )}
      </NavLink>
    </li>
  );
  return (
    <nav className="flex-1 overflow-y-auto p-2" aria-label="منوی سیستم‌ها">
      {groups.map((g, gi) => {
        if (!g.title || collapsed) {
          return <ul key={gi} className={cn("space-y-0.5", gi > 0 && collapsed && "mt-2 border-t border-border pt-2")}>{g.items.map(item)}</ul>;
        }
        const open = !closed[g.title];
        const id = `nav-g-${gi}`;
        return (
          <div key={g.title} className="mt-1">
            <button type="button" onClick={() => toggle(g.title)} aria-expanded={open} aria-controls={id}
              className="flex h-8 w-full items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-foreground hover:bg-row-hover">
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "rotate-90")} aria-hidden />
              {g.title}
            </button>
            {open && <ul id={id} className="space-y-0.5">{g.items.map(item)}</ul>}
          </div>
        );
      })}
    </nav>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["notifications"], refetchInterval: 30_000,
    queryFn: () => get<{ unread: number; items: { id: number; title: string; body: string; link: string; is_read: boolean; created_iso: string }[] }>("/notifications/"),
  });
  const items = (q.data?.items ?? []).map((n) => ({
    id: String(n.id), title: n.title, description: n.body, date: new Date(n.created_iso), read: n.is_read, href: n.link,
  }));
  const read = async (ids?: number[]) => { await post("/notifications/read/", ids ? { ids } : {}); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  return (
    <div className="text-topbar-foreground" onClickCapture={(e) => {
      const a = (e.target as HTMLElement).closest("a[href^='/']");
      if (a) { e.preventDefault(); navigate(a.getAttribute("href")!); }
    }}>
      <NotificationInbox items={items} onRead={(id) => read([Number(id)])} onReadAll={() => read()} />
    </div>
  );
}

function useCommands(): CommandItem[] {
  const navigate = useNavigate();
  const groups = useNav();
  const { logout } = useAuth();
  return [
    ...groups.flatMap((g) => g.items.map((it) => ({
      id: it.to, label: it.label, icon: it.icon, group: g.title || "عمومی", keywords: [g.title], onSelect: () => navigate(it.to),
    }))),
    { id: "profile", label: "حساب کاربری و جانشین", icon: UserRound, group: "حساب", onSelect: () => navigate("/profile") },
    { id: "logout", label: "خروج از سامانه", icon: LogOut, group: "حساب", onSelect: logout },
  ];
}

const THEMES = [
  { value: "light", label: "روشن", icon: Sun },
  { value: "dark", label: "تیره", icon: Moon },
  { value: "system", label: "مطابق سیستم", icon: Monitor },
] as const;

const TOP_BTN = "inline-flex size-9 items-center justify-center rounded-control text-topbar-foreground hover:bg-topbar-foreground/10";

export function Shell() {
  const { user, system, logout, setTheme } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [search, setSearch] = React.useState(false);
  const workspace = WORKSPACE.some((r) => r.test(loc.pathname));
  const [collapsedPref, setCollapsedPref] = React.useState(() => readPref("nikyar:nav-collapsed", false));
  const collapsed = workspace || collapsedPref;
  const main = React.useRef<HTMLElement>(null);
  const prevPath = React.useRef(loc.pathname);
  const commands = useCommands();

  React.useEffect(() => {
    setMobileOpen(false);
    if (prevPath.current === loc.pathname) return;
    prevPath.current = loc.pathname;
    main.current?.focus({ preventScroll: true });
    main.current?.scrollTo({ top: 0 });
  }, [loc.pathname]);

  if (!user) return null;
  const theme = THEMES.find((t) => t.value === user.theme) ?? THEMES[0];

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <a href="#main" className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-2">
        پرش به محتوای اصلی
      </a>
      {/* نوار بالا */}
      <header className="flex h-12 shrink-0 items-center gap-2 bg-topbar px-2 text-topbar-foreground lg:px-3">
        <button type="button" className={cn(TOP_BTN, "lg:hidden")} aria-label="باز کردن منو" onClick={() => setMobileOpen(true)}>
          <Menu className="size-5" aria-hidden />
        </button>
        <button type="button" className={cn(TOP_BTN, "hidden lg:inline-flex")} aria-label={collapsed ? "باز کردن منو" : "جمع کردن منو"}
          aria-pressed={!collapsed} onClick={() => { setCollapsedPref(!collapsed); writePref("nikyar:nav-collapsed", !collapsed); }}>
          {collapsed ? <PanelRightOpen className="size-5" aria-hidden /> : <PanelRightClose className="size-5" aria-hidden />}
        </button>
        <NavLink to="/" className="flex items-center gap-2 rounded-control px-1">
          <span aria-hidden className="grid size-7 place-items-center rounded-control bg-topbar-foreground text-sm font-bold text-topbar">ن</span>
          <span className="font-bold">نیک‌یار</span>
          <span className="hidden text-sm text-topbar-muted md:inline">· {system?.customer}</span>
        </NavLink>
        <button type="button" onClick={() => setSearch(true)}
          className="ms-auto hidden h-8 w-72 items-center gap-2 rounded-control bg-topbar-foreground/10 px-3 text-sm text-topbar-muted hover:bg-topbar-foreground/15 md:flex">
          <Search className="size-4 shrink-0" aria-hidden /> <span className="truncate whitespace-nowrap">جست‌وجوی بخش‌ها</span>
          <span className="ms-auto shrink-0 text-xs" dir="ltr">Ctrl+K</span>
        </button>
        <button type="button" className={cn(TOP_BTN, "ms-auto md:hidden")} aria-label="جست‌وجو" onClick={() => setSearch(true)}>
          <Search className="size-5" aria-hidden />
        </button>
        <span className="hidden px-2 text-sm text-topbar-muted xl:inline">{todayLabel()}</span>
        <DropdownMenu align="end" triggerLabel={`تم: ${theme.label}`}
          trigger={<span className={TOP_BTN}><theme.icon className="size-4" aria-hidden /></span>}
          items={THEMES.map((t) => ({ label: `${t.label}${t.value === user.theme ? " (فعلی)" : ""}`, icon: t.icon, onSelect: () => setTheme(t.value) }))} />
        <Notifications />
        <DropdownMenu align="end" triggerLabel={`حساب کاربری: ${user.full_name}`}
          trigger={
            <span className="flex h-9 items-center gap-2 rounded-control px-2 text-topbar-foreground hover:bg-topbar-foreground/10">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-topbar-foreground/15 text-sm font-bold">{user.full_name.trim().charAt(0)}</span>
              <span className="hidden text-start leading-tight md:block">
                <span className="block text-sm font-medium">{user.full_name}</span>
                <span className="block text-xs text-topbar-muted">{user.positions[0]?.title ?? (user.is_superuser ? "مدیر سامانه" : "")}</span>
              </span>
            </span>
          }
          items={[
            { type: "label", label: user.username },
            { label: "حساب کاربری و جانشین", icon: UserRound, onSelect: () => navigate("/profile") },
            { label: "تغییر رمز عبور", icon: KeyRound, onSelect: () => navigate("/profile") },
            { type: "separator" },
            { label: "خروج", icon: LogOut, danger: true, onSelect: logout },
          ]} />
      </header>
      <div className="flex min-h-0 flex-1">
        {/* منوی سیستم‌ها */}
        <aside aria-label="نوار کناری" className={cn("hidden shrink-0 flex-col border-e border-border bg-card transition-[width] duration-(--motion) lg:flex", collapsed ? "w-14" : "w-60")}>
          <TreeNav collapsed={collapsed} />
        </aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="start" title="منو">
          <TreeNav onNavigate={() => setMobileOpen(false)} />
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <PageTabsProvider>
            <main id="main" ref={main} tabIndex={-1}
              className={cn("min-h-0 flex-1 focus:outline-none", workspace ? "overflow-hidden" : "overflow-y-auto px-3 py-3 lg:px-5 lg:py-4")}>
              {workspace ? <Outlet /> : <div className="w-full"><Outlet /></div>}
            </main>
          </PageTabsProvider>
        </div>
      </div>
      <CommandDialog open={search} onOpenChange={setSearch} items={commands} placeholder="نام بخش یا اقدام را بنویسید…" emptyText="بخشی با این نام پیدا نشد." />
    </div>
  );
}
