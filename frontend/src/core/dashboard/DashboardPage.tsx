import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, ArrowLeft, CheckCheck, Inbox, Plus, Send, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { get, type Paged } from "@/app/api";
import { useAuth } from "@/app/auth";
import { LinkButton, LoadingBlock, PageHeader, Panel, StatusBadge } from "@/app/ui";
import { cn, fa } from "@/lib/utils";
import type { InstanceRow, WorkItemRow } from "@/core/workflow/types";

type Dash = { inbox_open: number; inbox_unread: number; inbox_overdue: number; my_running: number; my_completed: number; done_by_me: number };

/** کارت عددی که خودش مقصد است؛ کل کارت لینک است (یک هدف بزرگ و قابل‌لمس) */
function MetricLink({ to, label, value, icon: Icon, tone }: { to: string; label: string; value?: number; icon: typeof Inbox; tone?: "warning" }) {
  return (
    <Link to={to} className={cn(
      "group flex min-h-24 items-center gap-4 rounded-surface border-line border-border bg-card p-5 shadow-surface transition-colors hover:border-brand/40",
      tone === "warning" && value ? "border-warning/40 bg-warning/5" : "",
    )}>
      <span aria-hidden className={cn("grid size-11 shrink-0 place-items-center rounded-control", tone === "warning" && value ? "bg-warning/15 text-warning" : "bg-brand/10 text-brand")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className="block text-2xl font-bold tabular-nums">{value === undefined ? "…" : fa(value)}</span>
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, can, moduleEnabled } = useAuth();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dash>("/workflow/dashboard/") });
  const inbox = useQuery({ queryKey: ["inbox", "inbox"], queryFn: () => get<WorkItemRow[]>("/workflow/inbox/") });
  const mine = useQuery({ queryKey: ["instances", "mine-recent"], queryFn: () => get<Paged<InstanceRow>>("/workflow/instances/?mine=1&page_size=5") });
  const staff = useQuery({
    queryKey: ["personnel-stats"], enabled: moduleEnabled("personnel") && can("personnel.employee.view"),
    queryFn: () => get<{ total: number; active: number }>("/personnel/employees/stats/"),
  });
  const d = dash.data;

  return (
    <>
      <PageHeader title={`${user?.first_name || user?.full_name}، خوش آمدید`} docTitle="پیشخوان" description="خلاصه‌ی کارها و درخواست‌های شما"
        actions={<LinkButton to="/new"><Plus className="size-4" aria-hidden /> ثبت درخواست جدید</LinkButton>} />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricLink to="/inbox" label="کارهای در انتظار من" value={d?.inbox_open} icon={Inbox} />
        <MetricLink to="/inbox" label="کارهای دیرکرد" value={d?.inbox_overdue} icon={AlarmClock} tone="warning" />
        <MetricLink to="/requests?mine=1&status=running" label="درخواست‌های در جریان من" value={d?.my_running} icon={Send} />
        {staff.data
          ? <MetricLink to="/personnel" label="پرسنل شاغل" value={staff.data.active} icon={Users} />
          : <MetricLink to="/inbox/done" label="کارهای انجام‌شده‌ی من" value={d?.done_by_me} icon={CheckCheck} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="کارهای در انتظار شما" flush
          actions={<Link to="/inbox" className="flex min-h-10 items-center gap-1 rounded-control px-2 text-sm text-brand hover:underline">همه‌ی کارتابل <ArrowLeft className="size-4" aria-hidden /></Link>}>
          {inbox.isLoading ? <div className="p-5"><LoadingBlock rows={3} /></div> : !inbox.data?.length ? (
            <div className="p-4"><EmptyState icon={Inbox} title="کار در انتظاری ندارید" description="وقتی کاری به شما ارجاع شود، اینجا می‌بینید." /></div>
          ) : (
            <ul className="divide-y divide-border">
              {inbox.data.slice(0, 6).map((w) => (
                <li key={w.id}>
                  <Link to={`/tasks/${w.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-accent/60">
                    <span className="min-w-0">
                      <span className={cn("block truncate", !w.is_read && "font-semibold")}>
                        {!w.is_read && <span className="sr-only">خوانده‌نشده: </span>}{w.name}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{w.process_title} · {w.initiator_name}</span>
                    </span>
                    {w.overdue ? <StatusBadge tone="destructive" label="دیرکرد" /> : <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{fa(w.created_at.split(" ")[0])}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="درخواست‌های اخیر من" flush
          actions={<Link to="/requests?mine=1" className="flex min-h-10 items-center gap-1 rounded-control px-2 text-sm text-brand hover:underline">همه <ArrowLeft className="size-4" aria-hidden /></Link>}>
          {mine.isLoading ? <div className="p-5"><LoadingBlock rows={3} /></div> : !mine.data?.results.length ? (
            <div className="p-4"><EmptyState icon={Send} title="هنوز درخواستی ثبت نکرده‌اید"
              action={<LinkButton to="/new" variant="outline"><Plus className="size-4" aria-hidden /> ثبت اولین درخواست</LinkButton>} /></div>
          ) : (
            <ul className="divide-y divide-border">
              {mine.data.results.map((i) => (
                <li key={i.id}>
                  <Link to={`/requests/${i.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-accent/60">
                    <span className="min-w-0">
                      <span className="block truncate">{i.title}</span>
                      <span className="block text-sm text-muted-foreground tabular-nums">شماره‌ی پیگیری {fa(i.tracking_code)}</span>
                    </span>
                    <StatusBadge status={i.status} label={i.status_display} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
