import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Pagination } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { get, type Paged } from "@/app/api";
import { ErrorBlock, PageHeader, Panel, StatusBadge, useUrlState } from "@/app/ui";
import { ListToolbar, ResponsiveList, type Column, type Sort } from "@/app/list";
import { en, fa } from "@/lib/utils";
import type { InstanceRow } from "./types";

const PAGE = 20;

export default function InstancesPage() {
  const [q, setQ] = useUrlState("q");
  const [status, setStatus] = useUrlState("status");
  const [mine, setMine] = useUrlState("mine");
  const [page, setPage] = useUrlState("page", "1");
  const [ordering, setOrdering] = useUrlState("ordering", "-started_at");
  const params = new URLSearchParams({ page, page_size: String(PAGE), ordering, ...(q && { q: en(q) }), ...(status && { status }), ...(mine && { mine: "1" }) });
  const data = useQuery({ queryKey: ["instances", params.toString()], queryFn: () => get<Paged<InstanceRow>>(`/workflow/instances/?${params}`), placeholderData: (p) => p });
  const sort: Sort = ordering ? { key: ordering.replace("-", ""), dir: ordering.startsWith("-") ? "desc" : "asc" } : null;

  const columns: Column<InstanceRow>[] = [
    { key: "title", header: "عنوان", primary: true, sortKey: "title", cell: (i) => i.title },
    { key: "tracking_code", header: "شماره‌ی پیگیری", sortKey: "tracking_code", cell: (i) => <bdi className="tabular-nums">{fa(i.tracking_code)}</bdi> },
    { key: "process", header: "فرایند", cell: (i) => i.process_title, hideOnMobile: true },
    { key: "initiator", header: "درخواست‌دهنده", cell: (i) => i.initiator_name },
    { key: "started_at", header: "تاریخ ثبت", sortKey: "started_at", cell: (i) => <span className="tabular-nums">{fa(i.started_at)}</span> },
    { key: "step", header: "مرحله‌ی جاری", cell: (i) => i.current_tasks.join("، ") || <span className="text-muted-foreground">—</span>, hideOnMobile: true },
    { key: "status", header: "وضعیت", cell: (i) => <StatusBadge status={i.status} label={i.status_display} /> },
  ];

  return (
    <>
      <PageHeader title="پیگیری درخواست‌ها" description="درخواست‌هایی که ثبت کرده‌اید یا در آن‌ها مشارکت داشته‌اید" />
      {data.error ? <ErrorBlock error={data.error} onRetry={() => data.refetch()} /> : (
        <Panel flush>
          <ListToolbar count={data.data?.count}>
            <div className="w-full sm:w-72"><SearchInput value={q} onChange={setQ} debounce={300} placeholder="شماره‌ی پیگیری یا عنوان" aria-label="جست‌وجوی درخواست" size="sm" /></div>
            <SegmentedControl size="sm" value={status} onChange={setStatus} aria-label="فیلتر وضعیت" options={[
              { value: "", label: "همه" }, { value: "running", label: "در جریان" }, { value: "completed", label: "خاتمه‌یافته" }, { value: "cancelled", label: "لغو شده" }]} />
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <Switch checked={mine === "1"} onCheckedChange={(v) => setMine(v ? "1" : "")} aria-label="فقط درخواست‌های من" /> فقط درخواست‌های من
            </label>
          </ListToolbar>
          <ResponsiveList rows={data.data?.results ?? []} columns={columns} rowKey={(i) => i.id} loading={data.isLoading} caption="فهرست درخواست‌ها"
            rowHref={(i) => `/requests/${i.id}`} sort={sort}
            onSortChange={(s) => setOrdering(s ? `${s.dir === "desc" ? "-" : ""}${s.key}` : "-started_at")}
            empty={{ icon: FileSearch, title: "درخواستی پیدا نشد", description: q || status || mine ? "فیلترها را تغییر دهید." : "هنوز درخواستی ثبت نشده است." }} />
          {(data.data?.count ?? 0) > PAGE && (
            <div className="flex justify-center border-t border-border p-3">
              <Pagination page={Number(page)} total={Math.ceil((data.data?.count ?? 0) / PAGE)} onChange={(p) => setPage(String(p))} size="sm" />
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
