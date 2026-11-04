import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { get, post, tokenStore, type Paged } from "@/app/api";
import { useAuth } from "@/app/auth";
import { LoadingBlock, PageHeader, Panel, StatusBadge, useApiAction } from "@/app/ui";
import { FormRenderer } from "@/core/forms/FormRenderer";
import { useLookupBundle, useUnits } from "@/core/forms/useFormRefs";
import type { FormSchema, Values } from "@/core/forms/types";
import { en, fa } from "@/lib/utils";

type Row = { id: number; personnel_code: string; full_name: string; national_id: string; employment_status: string; employment_status_title: string;
  employment_type_title: string; hire_date: string | null; org_unit_title: string; position_title: string; job_title: string };
const PAGE = 20;

const NEW_SCHEMA: FormSchema = { sections: [{ id: "n", title: "", columns: 2, fields: [
  { key: "first_name", type: "text", label: "نام", required: true },
  { key: "last_name", type: "text", label: "نام خانوادگی", required: true },
  { key: "national_id", type: "national_id", label: "کد ملی", required: true },
  { key: "gender", type: "lookup", label: "جنسیت", required: true, config: { lookup: "gender" } },
  { key: "military_status", type: "lookup", label: "وضعیت نظام وظیفه", required: true, config: { lookup: "military_status" }, visibleIf: { field: "gender", op: "eq", value: "male" } },
  { key: "employment_type", type: "lookup", label: "نوع استخدام", config: { lookup: "employment_type" } },
  { key: "hire_date", type: "date", label: "تاریخ استخدام" },
  { key: "org_unit", type: "org_unit", label: "واحد سازمانی" },
] }] };

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("active");
  const [unit, setUnit] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(false);
  const lookups = useLookupBundle(["employment_status"]);
  const units = useUnits();
  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE), ...(q && { q: en(q) }), ...(status && { employment_status: status }), ...(unit && { org_unit: unit }) });
  const data = useQuery({ queryKey: ["employees", params.toString()], queryFn: () => get<Paged<Row>>(`/personnel/employees/?${params}`) });
  React.useEffect(() => setPage(1), [q, status, unit]);

  const exportCsv = async () => {
    const res = await fetch(`/api/personnel/employees/export/?${params}`, { headers: { Authorization: `Token ${tokenStore.get()}` } });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = "personnel.csv";
    a.click();
  };

  return (
    <>
      <PageHeader title="پرونده‌های پرسنلی" description={data.data ? `${fa(data.data.count)} پرونده` : undefined}
        actions={<>
          {can("personnel.export") && <Button variant="outline" onClick={exportCsv}><Download className="size-4" /> خروجی اکسل</Button>}
          {can("personnel.employee.edit") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> پرونده‌ی جدید</Button>}
        </>} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput value={q} onChange={setQ} debounce={300} placeholder="نام، کد ملی، کد پرسنلی یا موبایل" size="sm" />
          <Select className="w-44" aria-label="وضعیت اشتغال" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="همه‌ی وضعیت‌ها"
            options={(lookups.data?.employment_status ?? []).map((i) => ({ value: i.code, label: i.title }))} />
          <Select className="w-52" aria-label="واحد" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="همه‌ی واحدها"
            options={(units.data ?? []).map((u) => ({ value: String(u.id), label: u.title }))} />
        </div>
        {data.isLoading ? <div className="p-5"><LoadingBlock /></div> : !data.data?.results.length ? (
          <EmptyState icon={Users} title="پرونده‌ای پیدا نشد" description="فیلترها را تغییر دهید یا پرونده‌ی جدید ثبت کنید." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="whitespace-nowrap">
              <TableHeader><TableRow>
                <TableHead>نام و نام خانوادگی</TableHead><TableHead>کد پرسنلی</TableHead><TableHead>کد ملی</TableHead>
                <TableHead>واحد / سمت</TableHead><TableHead>نوع استخدام</TableHead><TableHead>تاریخ استخدام</TableHead><TableHead>وضعیت</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.data.results.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/personnel/${r.id}`)}>
                    <TableCell><span className="flex items-center gap-3"><Avatar name={r.full_name} size="sm" /><span className="font-medium">{r.full_name}</span></span></TableCell>
                    <TableCell>{fa(r.personnel_code)}</TableCell>
                    <TableCell dir="ltr" className="text-end">{fa(r.national_id)}</TableCell>
                    <TableCell><span className="block">{r.org_unit_title || "—"}</span><span className="text-xs text-muted-foreground">{r.position_title || r.job_title}</span></TableCell>
                    <TableCell>{r.employment_type_title || "—"}</TableCell>
                    <TableCell>{r.hire_date ? fa(r.hire_date) : "—"}</TableCell>
                    <TableCell><StatusBadge status={r.employment_status} label={r.employment_status_title} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(data.data?.count ?? 0) > PAGE && (
          <div className="flex justify-center border-t border-border p-3"><Pagination page={page} total={Math.ceil((data.data?.count ?? 0) / PAGE)} onChange={setPage} size="sm" /></div>
        )}
      </Panel>
      {open && <NewEmployeeDialog onClose={() => setOpen(false)} onCreated={(id) => navigate(`/personnel/${id}`)} />}
    </>
  );
}

function NewEmployeeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const run = useApiAction();
  const [values, setValues] = React.useState<Values>({ employment_status: "active" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = async () => {
    const body = { ...values, hire_date: values.hire_date || null, org_unit: values.org_unit || null };
    const r = await run(() => post<{ id: number }>("/personnel/employees/", body), "پرونده ساخته شد.");
    if (r.ok && r.data) onCreated(r.data.id); else setErrors(r.fields ?? {});
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="پرونده‌ی پرسنلی جدید" description="بقیه‌ی اطلاعات را بعد از ساخت پرونده تکمیل کنید." className="max-w-2xl"
      footer={<><Button onClick={save}>ساخت پرونده</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <FormRenderer schema={NEW_SCHEMA} values={values} onChange={setValues} errors={errors} />
    </Dialog>
  );
}
