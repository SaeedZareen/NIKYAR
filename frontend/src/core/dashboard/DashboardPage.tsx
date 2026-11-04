import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Inbox, Plus } from "lucide-react";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { get, type Paged } from "@/app/api";
import { useAuth } from "@/app/auth";
import { LoadingBlock, PageHeader, Panel, StatusBadge } from "@/app/ui";
import { fa } from "@/lib/utils";
import type { InstanceRow, WorkItemRow } from "@/core/workflow/types";

type Dash = { inbox_open: number; inbox_unread: number; inbox_overdue: number; my_running: number; my_completed: number; done_by_me: number };

export default function DashboardPage() {
  const { user, can, moduleEnabled } = useAuth();
  const navigate = useNavigate();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dash>("/workflow/dashboard/") });
  const inbox = useQuery({ queryKey: ["inbox", "inbox"], queryFn: () => get<WorkItemRow[]>("/workflow/inbox/") });
  const mine = useQuery({ queryKey: ["instances", "mine"], queryFn: () => get<Paged<InstanceRow>>("/workflow/instances/?mine=1&page_size=5") });
  const staff = useQuery({
    queryKey: ["personnel-stats"], enabled: moduleEnabled("personnel") && can("personnel.employee.view"),
    queryFn: () => get<{ total: number; active: number }>("/personnel/employees/stats/"),
  });
  const d = dash.data;

  return (
    <>
      <PageHeader title={`${user?.first_name || user?.full_name} عزیز، خوش آمدید`} description="خلاصه‌ی کارها و درخواست‌های شما"
        actions={<Button onClick={() => navigate("/new")}><Plus className="size-4" /> ثبت درخواست جدید</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["کارهای در انتظار", d?.inbox_open], ["کارهای دیرکرد", d?.inbox_overdue],
          ["درخواست‌های در جریان من", d?.my_running],
          staff.data ? ["پرسنل شاغل", staff.data.active] : ["کارهای انجام‌شده‌ی من", d?.done_by_me],
        ].map(([label, value]) => (
          <Stat key={label as string} className="min-h-24" label={label as string} value={value === undefined ? "—" : fa(value as number)} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="آخرین کارهای کارتابل" actions={<Link to="/inbox" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">همه <ArrowLeft className="size-4" /></Link>} bodyClassName="p-0">
          {inbox.isLoading ? <div className="p-5"><LoadingBlock rows={3} /></div> : !inbox.data?.length ? (
            <EmptyState icon={Inbox} title="کارتابل شما خالی است" description="کار جدیدی در انتظار شما نیست." />
          ) : (
            <ul className="divide-y divide-border">
              {inbox.data.slice(0, 6).map((w) => (
                <li key={w.id}>
                  <Link to={`/tasks/${w.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-accent/50">
                    <span className="min-w-0">
                      <span className={`block truncate text-sm ${w.is_read ? "" : "font-semibold"}`}>{w.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{w.process_title} · {w.initiator_name}</span>
                    </span>
                    <span className="shrink-0 text-end text-xs text-muted-foreground">
                      {w.overdue ? <Badge variant="destructive">دیرکرد</Badge> : fa(w.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="درخواست‌های اخیر من" actions={<Link to="/requests" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">همه <ArrowLeft className="size-4" /></Link>} bodyClassName="p-0">
          {mine.isLoading ? <div className="p-5"><LoadingBlock rows={3} /></div> : !mine.data?.results.length ? (
            <EmptyState title="هنوز درخواستی ثبت نکرده‌اید" action={<Button variant="outline" size="sm" onClick={() => navigate("/new")}>ثبت اولین درخواست</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {mine.data.results.map((i) => (
                <li key={i.id}>
                  <Link to={`/requests/${i.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-accent/50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{i.title}</span>
                      <span className="block text-xs text-muted-foreground">شماره‌ی پیگیری {fa(i.tracking_code)}</span>
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
