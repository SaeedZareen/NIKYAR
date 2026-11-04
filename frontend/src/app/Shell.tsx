import * as React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Menu, Moon, Sun } from "lucide-react";
import { SidebarGroup } from "@/components/ui/sidebar";
import { Sheet } from "@/components/ui/sheet";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { NotificationInbox } from "@/components/ui/notification-inbox";
import { Button } from "@/components/ui/button";
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
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2" aria-label="منوی اصلی">
      {groups.map((g) => (
        <SidebarGroup key={g.title} title={g.title}>
          {g.items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
              className={({ isActive }) => cn(
                "flex min-h-10 items-center gap-2.5 rounded-control px-2.5 text-sm transition-colors duration-(--motion) ease-motion",
                isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}>
              <it.icon className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{it.label}</span>
              {it.badge === "inbox" && !!counts.data?.open && (
                <span className="ms-auto rounded-full bg-brand px-2 text-xs font-semibold leading-5 text-brand-foreground">{fa(counts.data.open)}</span>
              )}
            </NavLink>
          ))}
        </SidebarGroup>
      ))}
    </nav>
  );
}

function SideContent({ onNavigate }: { onNavigate?: () => void }) {
  const { system } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <div className="text-lg font-bold leading-tight">نیک‌یار</div>
        <div className="text-xs text-muted-foreground">سامانه‌ی یکپارچه‌ی سازمانی</div>
      </div>
      <Nav onNavigate={onNavigate} />
      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{system?.customer}</div>
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

export function Shell() {
  const { user, logout, setTheme } = useAuth();
  const [open, setOpen] = React.useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  React.useEffect(() => setOpen(false), [loc.pathname]);
  if (!user) return null;
  const dark = user.theme !== "paper";

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-e border-border bg-card lg:block">
        <SideContent />
      </aside>
      <Sheet open={open} onOpenChange={setOpen} side="start" title="منو">
        <SideContent onNavigate={() => setOpen(false)} />
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="باز کردن منو" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <span className="hidden text-sm text-muted-foreground sm:block">{todayLabel()}</span>
          <span className="flex-1" />
          <Button variant="ghost" size="icon" aria-label={dark ? "تم روشن" : "تم تیره"} onClick={() => setTheme(dark ? "paper" : "graphite")}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Notifications />
          <DropdownMenu align="end"
            trigger={
              <span className="flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-accent">
                <Avatar name={user.full_name} size="sm" />
                <span className="hidden text-start leading-tight sm:block">
                  <span className="block text-sm font-medium">{user.full_name}</span>
                  <span className="block text-xs text-muted-foreground">{user.positions[0]?.title ?? (user.is_superuser ? "مدیر سامانه" : "")}</span>
                </span>
              </span>
            }
            items={[
              { type: "label", label: user.username },
              { label: "تغییر رمز عبور", icon: KeyRound, onSelect: () => navigate("/profile") },
              { type: "separator" },
              { label: "خروج", icon: LogOut, danger: true, onSelect: logout },
            ]} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
