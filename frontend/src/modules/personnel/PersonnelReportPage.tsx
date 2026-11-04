import { useQuery } from "@tanstack/react-query";
import { BarChart } from "@/components/charts/bar-chart";
import { PieChart } from "@/components/charts/pie-chart";
import { Stat } from "@/components/ui/stat";
import { get } from "@/app/api";
import { ErrorBlock, LoadingBlock, PageHeader, Panel } from "@/app/ui";
import { fa } from "@/lib/utils";

type Stats = { total: number; active: number; by_status: { title: string; count: number }[]; by_type: { title: string; count: number }[]; by_unit: { title: string; count: number }[] };

export default function PersonnelReportPage() {
  const q = useQuery({ queryKey: ["personnel-stats-full"], queryFn: () => get<Stats>("/personnel/employees/stats/") });
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <LoadingBlock rows={8} />;
  const s = q.data;
  return (
    <>
      <PageHeader title="گزارش نیروی انسانی" description="ترکیب نیروی انسانی سازمان" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["کل پرونده‌ها", s.total], ["شاغل", s.active], ["سایر وضعیت‌ها", s.total - s.active], ["تعداد واحدها", s.by_unit.length]].map(([l, v]) => (
          <Stat key={l as string} className="min-h-24" label={l as string} value={fa(v as number)} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel><p className="sr-only">بیشترین پرسنل: {s.by_unit[0]?.title} با {fa(s.by_unit[0]?.count ?? 0)} نفر.</p><BarChart title="پرسنل به تفکیک واحد" data={s.by_unit} x="title" series={[{ key: "count", label: "تعداد" }]} orientation="horizontal" showValues /></Panel>
        <Panel><PieChart title="نوع استخدام" variant="donut" data={s.by_type.map((r) => ({ label: r.title, value: r.count }))} centerLabel="نفر" centerValue={fa(s.total)} /></Panel>
        <Panel><PieChart title="وضعیت اشتغال" data={s.by_status.map((r) => ({ label: r.title, value: r.count }))} /></Panel>
      </div>
    </>
  );
}
