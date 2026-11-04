import { useQuery } from "@tanstack/react-query";
import { Inbox, FileCheck2 } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { get } from "@/app/api";
import { ErrorBlock, PageHeader, Panel, StatusBadge, useUrlState } from "@/app/ui";
import { ListToolbar, matches, ResponsiveList, type Column } from "@/app/list";
import { cn, fa } from "@/lib/utils";
import type { WorkItemRow } from "./types";

export default function InboxPage({ box }: { box: "inbox" | "done" }) {
  const done = box === "done";
  const q = useQuery({ queryKey: ["inbox", box], queryFn: () => get<WorkItemRow[]>(`/workflow/inbox/?box=${box}`) });
  const [term, setTerm] = useUrlState("q");
  const rows = (q.data ?? []).filter((w) => matches(term, w.name, w.instance_title, w.tracking_code, w.initiator_name, w.process_title));

  const columns: Column<WorkItemRow>[] = [
    {
      key: "name", header: "کار", primary: true, sortValue: (w) => w.name,
      cell: (w) => <span className={cn(!done && !w.is_read && "font-semibold")}>{!done && !w.is_read && <span className="sr-only">خوانده‌نشده: </span>}{w.name}</span>,
    },
    { key: "instance", header: "درخواست", sortValue: (w) => w.instance_title, cell: (w) => <span><span className="block">{w.instance_title}</span><span className="text-sm text-muted-foreground">{w.process_title}</span></span> },
    { key: "tracking", header: "شماره‌ی پیگیری", sortValue: (w) => w.tracking_code, cell: (w) => <bdi className="tabular-nums">{fa(w.tracking_code)}</bdi>, hideOnMobile: true },
    { key: "initiator", header: "درخواست‌دهنده", sortValue: (w) => w.initiator_name, cell: (w) => w.initiator_name },
    done
      ? { key: "completed", header: "تاریخ انجام", sortValue: (w) => w.completed_at ?? "", cell: (w) => <span className="tabular-nums">{fa(w.completed_at ?? "")}</span> }
      : { key: "created", header: "تاریخ دریافت", sortValue: (w) => w.created_at, cell: (w) => <span className="tabular-nums">{fa(w.created_at)}</span> },
    done
      ? { key: "status", header: "وضعیت", cell: (w) => <StatusBadge status={w.status} label={w.status_display} /> }
      : { key: "due", header: "مهلت", sortValue: (w) => w.due_at ?? "9", cell: (w) => (w.overdue ? <StatusBadge tone="destructive" label={`دیرکرد · ${fa(w.due_at ?? "")}`} /> : w.due_at ? <span className="tabular-nums">{fa(w.due_at)}</span> : <span className="text-muted-foreground">بدون مهلت</span>) },
  ];

  return (
    <>
      <PageHeader title={done ? "کارهای انجام‌شده" : "کارتابل"} description={done ? "سوابق کارهایی که انجام داده‌اید" : "کارهایی که منتظر اقدام شما هستند"} />
      {q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <Panel flush>
          <ListToolbar count={q.data ? rows.length : undefined}>
            <div className="w-full sm:w-80"><SearchInput value={term} onChange={setTerm} placeholder="جست‌وجو در عنوان، شماره یا درخواست‌دهنده" aria-label="جست‌وجو در کارتابل" size="sm" /></div>
          </ListToolbar>
          <ResponsiveList rows={rows} columns={columns} rowKey={(w) => w.id} loading={q.isLoading} caption={done ? "کارهای انجام‌شده" : "کارهای در انتظار"}
            rowHref={(w) => (done ? `/requests/${w.instance_id}` : `/tasks/${w.id}`)}
            rowClassName={(w) => (!done && w.overdue ? "bg-destructive/5" : undefined)}
            empty={term ? { title: "موردی با این عبارت پیدا نشد", description: "عبارت جست‌وجو را تغییر دهید." }
              : done ? { icon: FileCheck2, title: "هنوز کاری انجام نداده‌اید" }
              : { icon: Inbox, title: "کار در انتظاری ندارید", description: "وقتی کاری به شما ارجاع شود، اینجا نمایش داده می‌شود." }} />
        </Panel>
      )}
    </>
  );
}
