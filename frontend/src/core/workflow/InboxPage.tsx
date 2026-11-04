import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { get } from "@/app/api";
import { PageHeader, StatusBadge } from "@/app/ui";
import { fa } from "@/lib/utils";
import type { WorkItemRow } from "./types";

export default function InboxPage({ box }: { box: "inbox" | "done" }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["inbox", box], queryFn: () => get<WorkItemRow[]>(`/workflow/inbox/?box=${box}`) });
  const done = box === "done";
  const columns: Column<WorkItemRow & Record<string, unknown>>[] = [
    { key: "name", header: "عنوان کار", cell: (w) => <span className={w.is_read || done ? "" : "font-semibold"}>{w.name}</span> },
    { key: "instance_title", header: "درخواست", cell: (w) => <span><span className="block">{w.instance_title}</span><span className="text-xs text-muted-foreground">{w.process_title}</span></span> },
    { key: "tracking_code", header: "شماره‌ی پیگیری", cell: (w) => fa(w.tracking_code) },
    { key: "initiator_name", header: "درخواست‌دهنده" },
    done
      ? { key: "completed_at", header: "تاریخ انجام", sortable: true, cell: (w) => fa(w.completed_at ?? "") }
      : { key: "created_at", header: "تاریخ دریافت", sortable: true, cell: (w) => fa(w.created_at) },
    done
      ? { key: "status", header: "وضعیت", cell: (w) => <StatusBadge status={w.status} label={w.status_display} /> }
      : { key: "due_at", header: "مهلت", cell: (w) => w.due_at ? (w.overdue ? <Badge variant="destructive">دیرکرد</Badge> : fa(w.due_at)) : "—" },
  ];
  return (
    <>
      <PageHeader title={done ? "کارهای انجام‌شده" : "کارتابل"} description={done ? "سوابق کارهایی که انجام داده‌اید" : "کارهایی که منتظر اقدام شما هستند"} />
      <DataTable rows={(q.data ?? []) as (WorkItemRow & Record<string, unknown>)[]} columns={columns} rowKey={(w) => String(w.id)} loading={q.isLoading}
        searchKeys={["name", "instance_title", "tracking_code", "initiator_name"]} searchPlaceholder="جست‌وجو در عنوان، شماره یا درخواست‌دهنده"
        emptyTitle={done ? "هنوز کاری انجام نداده‌اید" : "کارتابل شما خالی است"} emptyDescription={done ? undefined : "وقتی کاری به شما ارجاع شود، اینجا نمایش داده می‌شود."}
        pageSize={15} onRowClick={(w) => navigate(done ? `/requests/${w.instance_id}` : `/tasks/${w.id}`)} />
    </>
  );
}
