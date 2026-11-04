import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { get, type Paged } from "@/app/api";
import { LoadingBlock, PageHeader, Panel } from "@/app/ui";
import { fa } from "@/lib/utils";

export type AuditRow = { id: number; entity: string; object_id: string; label: string; action: string; action_display: string; changes: Record<string, unknown>; note: string; user_name: string; at: string };
const ENTITY: Record<string, string> = {
  "personnel.employee": "پرونده‌ی پرسنلی", "auth.user": "کاربر", "accounts.role": "نقش", "org.orgunit": "واحد سازمانی",
  "org.position": "سمت", "lookups.lookupitem": "مقدار فهرست", "lookups.lookuptype": "فهرست پایه", "forms.formdefinition": "فرم",
  "workflow.processmodel": "فرایند", "personnel.education": "تحصیلات", "personnel.bankaccount": "حساب بانکی",
  "personnel.dependent": "فرد تحت تکفل", "personnel.workhistory": "سابقه‌ی کار", "personnel.document": "مدرک",
};
const VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = { create: "success", update: "warning", delete: "destructive" };

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <EmptyState icon={History} title="سابقه‌ای ثبت نشده است" />;
  return (
    <div className="overflow-x-auto">
      <Table className="whitespace-nowrap">
        <TableHeader><TableRow><TableHead>زمان</TableHead><TableHead>کاربر</TableHead><TableHead>عملیات</TableHead><TableHead>مورد</TableHead><TableHead>تغییرات</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{fa(r.at)}</TableCell>
              <TableCell>{r.user_name}</TableCell>
              <TableCell><Badge variant={VARIANT[r.action] ?? "secondary"}>{r.action_display}</Badge></TableCell>
              <TableCell><span className="block">{r.label}</span><span className="text-xs text-muted-foreground">{ENTITY[r.entity] ?? r.entity}</span></TableCell>
              <TableCell className="text-xs">
                {r.note && <div className="mb-1 text-muted-foreground">{r.note}</div>}
                {r.action === "update" ? Object.entries(r.changes).slice(0, 6).map(([k, v]) => {
                  const [a, b] = v as [unknown, unknown];
                  return <div key={k}><span dir="ltr" className="text-muted-foreground">{k}</span>: {fmt(a)} ← {fmt(b)}</div>;
                }) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? "…" : fa(String(v)));

export default function AuditPage() {
  const [page, setPage] = React.useState(1);
  const q = useQuery({ queryKey: ["audit", page], queryFn: () => get<Paged<AuditRow>>(`/audit/?page=${page}`) });
  return (
    <>
      <PageHeader title="سوابق تغییرات" description="چه کسی، چه زمانی، چه چیزی را تغییر داده است." />
      <Panel bodyClassName="p-0">
        {q.isLoading ? <div className="p-5"><LoadingBlock /></div> : <AuditTable rows={q.data?.results ?? []} />}
        {(q.data?.count ?? 0) > 25 && <div className="flex justify-center border-t border-border p-3"><Pagination page={page} total={Math.ceil((q.data?.count ?? 0) / 25)} onChange={setPage} size="sm" /></div>}
      </Panel>
    </>
  );
}
