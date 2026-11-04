import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { get } from "@/app/api";
import { ErrorBlock, JalaliDateInput, LoadingBlock, PageHeader, Panel, StatusBadge, useUrlState } from "@/app/ui";
import { ListToolbar, ToolbarFilter } from "@/app/list";
import { fa } from "@/lib/utils";

type Report = {
  processes: { id: number; title: string; total: number; running: number; completed: number; cancelled: number; avg_hours: number | null }[];
  steps: { name: string; done: number; open: number; overdue: number; avg_hours: number | null }[];
  workload: { name: string; open: number; overdue: number; done: number }[];
};

export function duration(h: number | null) {
  if (h === null || h === undefined) return "—";
  if (h < 1) return `${fa(Math.max(1, Math.round(h * 60)))} دقیقه`;
  if (h < 48) return `${fa(Math.round(h * 10) / 10)} ساعت`;
  return `${fa(Math.round((h / 24) * 10) / 10)} روز`;
}

export default function ReportsPage() {
  const [from, setFrom] = useUrlState("from");
  const [to, setTo] = useUrlState("to");
  const [proc, setProc] = useUrlState("process");
  const params = new URLSearchParams({ ...(from && { from }), ...(to && { to }), ...(proc && { process: proc }) });
  const q = useQuery({ queryKey: ["wf-report", params.toString()], queryFn: () => get<Report>(`/workflow/reports/?${params}`) });
  const r = q.data;
  const timed = (r?.steps ?? []).filter((s) => s.avg_hours !== null).slice(0, 8);
  const maxH = Math.max(0, ...timed.map((s) => s.avg_hours ?? 0));
  const [factor, unit] = maxH < 1 ? [60, "دقیقه"] : maxH < 48 ? [1, "ساعت"] : [1 / 24, "روز"];
  const bottlenecks = timed.map((s) => ({ name: s.name, value: Math.round((s.avg_hours ?? 0) * factor * 10) / 10 }));

  return (
    <>
      <PageHeader title="گزارش عملکرد فرایندها" description="مدت انجام، گلوگاه‌ها و بار کاری کارکنان" />
      <Panel className="mb-3" flush>
        <ListToolbar>
          <ToolbarFilter label="از تاریخ" htmlFor="from" className="w-56"><JalaliDateInput id="from" value={from} onChange={setFrom} /></ToolbarFilter>
          <ToolbarFilter label="تا تاریخ" htmlFor="to" className="w-56"><JalaliDateInput id="to" value={to} onChange={setTo} /></ToolbarFilter>
          <ToolbarFilter label="فرایند" htmlFor="rp-proc" className="w-64">
            <Select id="rp-proc" value={proc} placeholder="همه‌ی فرایندها" onChange={(e) => setProc(e.target.value)}
              options={(r?.processes ?? []).map((p) => ({ value: String(p.id), label: p.title }))} />
          </ToolbarFilter>
          {(from || to || proc) && <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); setProc(""); }}>حذف فیلترها</Button>}
        </ListToolbar>
      </Panel>
      {q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : q.isLoading || !r ? <LoadingBlock rows={8} /> : !r.processes.length ? (
        <EmptyState icon={BarChart3} title="در این بازه درخواستی ثبت نشده است" />
      ) : (
        <div className="space-y-6">
          <Panel title="خلاصه‌ی فرایندها" flush>
            <Table bare className="whitespace-nowrap">
              <TableHeader><TableRow><TableHead>فرایند</TableHead><TableHead>کل</TableHead><TableHead>در جریان</TableHead><TableHead>خاتمه‌یافته</TableHead><TableHead>لغو شده</TableHead><TableHead>میانگین مدت انجام</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.processes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>{fa(p.total)}</TableCell><TableCell>{fa(p.running)}</TableCell>
                    <TableCell>{fa(p.completed)}</TableCell><TableCell>{fa(p.cancelled)}</TableCell>
                    <TableCell>{duration(p.avg_hours)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              {bottlenecks.length ? (<>
                <p className="sr-only">کندترین مرحله: {timed[0]?.name} با میانگین {duration(timed[0]?.avg_hours ?? null)}. جزئیات در جدول «مراحل».</p>
                <BarChart title={`گلوگاه‌ها: میانگین زمان هر مرحله (${unit})`} data={bottlenecks} x="name" orientation="horizontal" showValues
                  series={[{ key: "value", label: `میانگین (${unit})` }]} />
              </>) : <EmptyState title="هنوز مرحله‌ای انجام نشده است" />}
            </Panel>
            <Panel title="مراحل" flush>
              <Table bare className="whitespace-nowrap">
                <TableHeader><TableRow><TableHead>مرحله</TableHead><TableHead>انجام‌شده</TableHead><TableHead>باز</TableHead><TableHead>دیرکرد</TableHead><TableHead>میانگین</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.steps.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell>{s.name}</TableCell><TableCell>{fa(s.done)}</TableCell><TableCell>{fa(s.open)}</TableCell>
                      <TableCell>{s.overdue ? <StatusBadge tone="destructive" label={fa(s.overdue)} /> : "۰"}</TableCell>
                      <TableCell>{duration(s.avg_hours)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
          <Panel title="بار کاری کارکنان" flush>
            <Table bare className="whitespace-nowrap">
              <TableHeader><TableRow><TableHead>کارمند</TableHead><TableHead>کارهای باز</TableHead><TableHead>دیرکرد</TableHead><TableHead>انجام‌شده</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.workload.map((w) => (
                  <TableRow key={w.name}>
                    <TableCell>{w.name}</TableCell><TableCell>{fa(w.open)}</TableCell>
                    <TableCell>{w.overdue ? <StatusBadge tone="destructive" label={fa(w.overdue)} /> : "۰"}</TableCell><TableCell>{fa(w.done)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>
      )}
    </>
  );
}
