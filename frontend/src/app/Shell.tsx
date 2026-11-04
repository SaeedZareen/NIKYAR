// پوسته‌ی برنامه: نوار کناری، نوار بالا، جست‌وجوی سراسری، لینک «پرش به محتوا»
// قواعد: nav-state-active، skip-links، focus-on-route-change، search-accessible، adaptive-navigation
import * as React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Menu, Monitor, Moon, Search, Sun, UserRound } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { NotificationInbox } from "@/components/ui/notification-inbox";
import { CommandDialog, type CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { JALALI_MONTHS, JALALI_WEEKDAYS, jalaliWeekday, toJalali } from "@/lib/jalali";
import { cn, fa } from "@/lib/utils";
import { get, post } from "./api";
import { useAuth } from "./auth";
import { MODULES, type NavGroup } from "./modules";

function todayLabel() {
  const d = new Date();
  const j = toJalali(d);
  return `${JALALI_WEEKDAYS[jalaliWeekday(d)]} ${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
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

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useNav();
  const counts = useQuery({ queryKey: ["inbox-counts"], queryFn: () => get<{ open: number; overdue: number }>("/workflow/inbox/counts/"), refetchInterval: 30_000 });
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="منوی اصلی">
      {groups.map((g, gi) => (
        <div key={g.title || gi} className={cn(gi > 0 && "mt-5")}>
          {g.title && <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.to}>
                <NavLink to={it.to} end={it.end} onClick={onNavigate}
                  className={({ isActive }) => cn(
                    "relative flex min-h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-(--motion) ease-motion",
                    isActive
                      ? "bg-brand/10 font-semibold text-brand before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-brand"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground",
                  )}>
                  <it.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="truncate">{it.label}</span>
                  {it.badge === "inbox" && !!counts.data?.open && (
                    <span className="ms-auto rounded-full bg-brand px-2 text-xs font-semibold leading-5 text-brand-foreground">
                      {fa(counts.data.open)}<span className="sr-only"> کار در انتظار</span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SideContent({ onNavigate }: { onNavigate?: () => void }) {
  const { system } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <span aria-hidden className="grid size-9 place-items-center rounded-control bg-primary text-base font-bold text-primary-foreground">ن</span>
        <div className="leading-tight">
          <div className="font-bold">نیک‌یار</div>
          <div className="text-xs text-muted-foreground">{system?.customer ?? "سامانه‌ی یکپارچه‌ی سازمانی"}</div>
        </div>
      </div>
      <Nav onNavigate={onNavigate} />
    </div>
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
    <div onClickCapture={(e) => {
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

export function Shell() {
  const { user, logout, setTheme } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const main = React.useRef<HTMLElement>(null);
  const commands = useCommands();
  const prevPath = React.useRef(loc.pathname);

  React.useEffect(() => {
    setOpen(false);
    // فقط پس از تغییر واقعی صفحه، فوکوس به محتوای اصلی (focus-on-route-change)؛
    // در بارگذاری اول فوکوس دست نمی‌خورد تا اولین Tab به «پرش به محتوا» برسد.
    if (prevPath.current === loc.pathname) return;
    prevPath.current = loc.pathname;
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  if (!user) return null;
  const theme = THEMES.find((t) => t.value === user.theme) ?? THEMES[0];

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a href="#main" className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
        پرش به محتوای اصلی
      </a>
      <aside aria-label="نوار کناری" className="sticky top-0 hidden h-dvh w-64 shrink-0 border-e border-border bg-card lg:block">
        <SideContent />
      </aside>
      <Sheet open={open} onOpenChange={setOpen} side="start" title="منو">
        <SideContent onNavigate={() => setOpen(false)} />
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="باز کردن منو" onClick={() => setOpen(true)}>
            <Menu className="size-5" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="جست‌وجو و رفتن به بخش‌ها" onClick={() => setSearch(true)}>
            <Search className="size-5" aria-hidden />
          </Button>
          <button type="button" onClick={() => setSearch(true)}
            className="hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-field border-line border-input bg-field px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 sm:flex sm:max-w-sm">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">جست‌وجو و رفتن به بخش‌ها…</span>
            <span className="ms-auto hidden sm:inline-flex" dir="ltr"><Kbd keys={["Ctrl", "K"]} /></span>
          </button>
          <span className="hidden flex-1 text-end text-sm text-muted-foreground xl:block">{todayLabel()}</span>
          <span className="flex-1 sm:hidden xl:hidden" />
          <DropdownMenu align="end" triggerLabel={`تم: ${theme.label}`}
            trigger={<span className="inline-flex size-10 items-center justify-center rounded-control text-muted-foreground hover:bg-accent hover:text-foreground"><theme.icon className="size-5" aria-hidden /></span>}
            items={THEMES.map((t) => ({ label: `${t.label}${t.value === user.theme ? " (فعلی)" : ""}`, icon: t.icon, onSelect: () => setTheme(t.value) }))} />
          <Notifications />
          <DropdownMenu align="end" triggerLabel={`حساب کاربری: ${user.full_name}`}
            trigger={
              <span className="flex min-h-10 items-center gap-2 rounded-control px-2 hover:bg-accent">
                <Avatar name={user.full_name} size="sm" />
                <span className="hidden text-start leading-tight md:block">
                  <span className="block text-sm font-medium">{user.full_name}</span>
                  <span className="block text-xs text-muted-foreground">{user.positions[0]?.title ?? (user.is_superuser ? "مدیر سامانه" : "")}</span>
                </span>
              </span>
            }
            items={[
              { type: "label", label: user.username },
              { label: "حساب کاربری و جانشین", icon: UserRound, onSelect: () => navigate("/profile") },
              { label: "تغییر رمز عبور", icon: KeyRound, onSelect: () => navigate("/profile#password") },
              { type: "separator" },
              { label: "خروج", icon: LogOut, danger: true, onSelect: logout },
            ]} />
        </header>
        <main id="main" ref={main} tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
      <CommandDialog open={search} onOpenChange={setSearch} items={commands} placeholder="نام بخش یا اقدام را بنویسید…" emptyText="بخشی با این نام پیدا نشد." />
    </div>
  );
}
