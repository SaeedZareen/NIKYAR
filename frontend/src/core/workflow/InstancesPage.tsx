import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Pagination } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { get, type Paged } from "@/app/api";
import { LoadingBlock, PageHeader, Panel, StatusBadge } from "@/app/ui";
import { en, fa } from "@/lib/utils";
import type { InstanceRow } from "./types";

const PAGE = 20;

export default function InstancesPage() {
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [mine, setMine] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE), ...(q && { q: en(q) }), ...(status && { status }), ...(mine && { mine: "1" }) });
  const data = useQuery({ queryKey: ["instances", params.toString()], queryFn: () => get<Paged<InstanceRow>>(`/workflow/instances/?${params}`) });
  React.useEffect(() => setPage(1), [q, status, mine]);

  return (
    <>
      <PageHeader title="پیگیری درخواست‌ها" description="درخواست‌هایی که ثبت کرده‌اید یا در آن‌ها مشارکت داشته‌اید" />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput value={q} onChange={setQ} debounce={300} placeholder="شماره‌ی پیگیری یا عنوان" size="sm" />
          <SegmentedControl size="sm" value={status} onChange={setStatus} aria-label="وضعیت" options={[
            { value: "", label: "همه" }, { value: "running", label: "در جریان" }, { value: "completed", label: "خاتمه‌یافته" }, { value: "cancelled", label: "لغو شده" }]} />
          <label className="flex min-h-11 items-center gap-2 text-sm"><Switch checked={mine} onCheckedChange={setMine} aria-label="فقط درخواست‌های من" /> فقط درخواست‌های من</label>
        </div>
        {data.isLoading ? <div className="p-5"><LoadingBlock /></div> : !data.data?.results.length ? (
          <EmptyState icon={FileSearch} title="درخواستی پیدا نشد" description="فیلترها را تغییر دهید." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="whitespace-nowrap">
              <TableHeader><TableRow>
                <TableHead>شماره‌ی پیگیری</TableHead><TableHead>عنوان</TableHead><TableHead>فرایند</TableHead>
                <TableHead>درخواست‌دهنده</TableHead><TableHead>تاریخ ثبت</TableHead><TableHead>مرحله‌ی جاری</TableHead><TableHead>وضعیت</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.data.results.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => navigate(`/requests/${i.id}`)}>
                    <TableCell>{fa(i.tracking_code)}</TableCell>
                    <TableCell className="font-medium">{i.title}</TableCell>
                    <TableCell>{i.process_title}</TableCell>
                    <TableCell>{i.initiator_name}</TableCell>
                    <TableCell>{fa(i.started_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{i.current_tasks.join("، ") || "—"}</TableCell>
                    <TableCell><StatusBadge status={i.status} label={i.status_display} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(data.data?.count ?? 0) > PAGE && (
          <div className="flex justify-center border-t border-border p-3">
            <Pagination page={page} total={Math.ceil((data.data?.count ?? 0) / PAGE)} onChange={setPage} size="sm" />
          </div>
        )}
      </Panel>
    </>
  );
}
