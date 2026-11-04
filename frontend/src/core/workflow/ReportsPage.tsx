import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form";
import { get } from "@/app/api";
import { JalaliDateInput, LoadingBlock, PageHeader, Panel } from "@/app/ui";
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
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [proc, setProc] = React.useState("");
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
      <Panel className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <FormField label="از تاریخ" className="w-48"><JalaliDateInput value={from} onChange={setFrom} /></FormField>
          <FormField label="تا تاریخ" className="w-48"><JalaliDateInput value={to} onChange={setTo} /></FormField>
          <FormField label="فرایند (برای مراحل)" htmlFor="rp-proc" className="w-60">
            <Select id="rp-proc" value={proc} placeholder="همه‌ی فرایندها" onChange={(e) => setProc(e.target.value)}
              options={(r?.processes ?? []).map((p) => ({ value: String(p.id), label: p.title }))} />
          </FormField>
          {(from || to || proc) && <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setProc(""); }}>حذف فیلترها</Button>}
        </div>
      </Panel>
      {q.isLoading || !r ? <LoadingBlock rows={8} /> : !r.processes.length ? (
        <EmptyState icon={BarChart3} title="در این بازه درخواستی ثبت نشده است" />
      ) : (
        <div className="space-y-6">
          <Panel title="خلاصه‌ی فرایندها" bodyClassName="p-0">
            <Table className="whitespace-nowrap">
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
              {bottlenecks.length ? (
                <BarChart title={`گلوگاه‌ها: میانگین زمان هر مرحله (${unit})`} data={bottlenecks} x="name" orientation="horizontal" showValues
                  series={[{ key: "value", label: `میانگین (${unit})` }]} />
              ) : <EmptyState title="هنوز مرحله‌ای انجام نشده است" />}
            </Panel>
            <Panel title="مراحل" bodyClassName="p-0">
              <Table className="whitespace-nowrap">
                <TableHeader><TableRow><TableHead>مرحله</TableHead><TableHead>انجام‌شده</TableHead><TableHead>باز</TableHead><TableHead>دیرکرد</TableHead><TableHead>میانگین</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.steps.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell>{s.name}</TableCell><TableCell>{fa(s.done)}</TableCell><TableCell>{fa(s.open)}</TableCell>
                      <TableCell>{s.overdue ? <Badge variant="destructive">{fa(s.overdue)}</Badge> : "۰"}</TableCell>
                      <TableCell>{duration(s.avg_hours)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
          <Panel title="بار کاری کارکنان" bodyClassName="p-0">
            <Table className="whitespace-nowrap">
              <TableHeader><TableRow><TableHead>کارمند</TableHead><TableHead>کارهای باز</TableHead><TableHead>دیرکرد</TableHead><TableHead>انجام‌شده</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.workload.map((w) => (
                  <TableRow key={w.name}>
                    <TableCell>{w.name}</TableCell><TableCell>{fa(w.open)}</TableCell>
                    <TableCell>{w.overdue ? <Badge variant="destructive">{fa(w.overdue)}</Badge> : "۰"}</TableCell><TableCell>{fa(w.done)}</TableCell>
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
