import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { get, post, tokenStore, type Paged } from "@/app/api";
import { useAuth } from "@/app/auth";
import { ErrorBlock, GuardedDialog, PageHeader, Panel, StatusBadge, SubmitButton, useApiAction, useUrlState } from "@/app/ui";
import { ToolbarFilter, ListToolbar, ResponsiveList, type Column, type Sort } from "@/app/list";
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
  const [q, setQ] = useUrlState("q");
  const [status, setStatus] = useUrlState("status", "active");
  const [unit, setUnit] = useUrlState("unit");
  const [page, setPage] = useUrlState("page", "1");
  const [ordering, setOrdering] = useUrlState("ordering", "last_name");
  const [open, setOpen] = React.useState(false);
  const lookups = useLookupBundle(["employment_status"]);
  const units = useUnits();
  const params = new URLSearchParams({ page, page_size: String(PAGE), ordering, ...(q && { q: en(q) }), ...(status && { employment_status: status }), ...(unit && { org_unit: unit }) });
  const data = useQuery({ queryKey: ["employees", params.toString()], queryFn: () => get<Paged<Row>>(`/personnel/employees/?${params}`), placeholderData: (p) => p });
  const sort: Sort = { key: ordering.replace("-", ""), dir: ordering.startsWith("-") ? "desc" : "asc" };

  const exportCsv = async () => {
    const res = await fetch(`/api/personnel/employees/export/?${params}`, { headers: { Authorization: `Token ${tokenStore.get()}` } });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = "personnel.csv";
    a.click();
  };

  const columns: Column<Row>[] = [
    { key: "last_name", header: "نام و نام خانوادگی", primary: true, sortKey: "last_name",
      cell: (r) => r.full_name },
    { key: "personnel_code", header: "کد پرسنلی", sortKey: "personnel_code", cell: (r) => <bdi className="tabular-nums">{fa(r.personnel_code)}</bdi> },
    { key: "national_id", header: "کد ملی", cell: (r) => <bdi dir="ltr" className="tabular-nums">{fa(r.national_id)}</bdi>, hideOnMobile: true },
    { key: "unit", header: "واحد سازمانی", cell: (r) => r.org_unit_title || "—" },
    { key: "position", header: "سمت", cell: (r) => r.position_title || r.job_title || "—", hideOnMobile: true },
    { key: "type", header: "نوع استخدام", cell: (r) => r.employment_type_title || "—", hideOnMobile: true },
    { key: "hire_date", header: "تاریخ استخدام", sortKey: "hire_date", cell: (r) => <span className="tabular-nums">{r.hire_date ? fa(r.hire_date) : "—"}</span>, hideOnMobile: true },
    { key: "status", header: "وضعیت", cell: (r) => <StatusBadge status={r.employment_status} label={r.employment_status_title} /> },
  ];

  return (
    <>
      <PageHeader title="پرونده‌های پرسنلی" description="اطلاعات هویتی، استخدامی، تحصیلی و مدارک پرسنل"
        actions={<>
          {can("personnel.export") && <Button variant="outline" onClick={exportCsv}><Download className="size-4" aria-hidden /> خروجی اکسل</Button>}
          {can("personnel.employee.edit") && <Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> پرونده‌ی جدید</Button>}
        </>} />
      {data.error ? <ErrorBlock error={data.error} onRetry={() => data.refetch()} /> : (
        <Panel flush>
          <ListToolbar count={data.data?.count}>
            <div className="w-full sm:w-80"><SearchInput value={q} onChange={setQ} debounce={300} placeholder="نام، کد ملی، کد پرسنلی یا موبایل" aria-label="جست‌وجوی پرسنل" size="sm" /></div>
            <ToolbarFilter label="وضعیت" htmlFor="flt-status" className="w-48">
              <Select id="flt-status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="همه‌ی وضعیت‌ها"
                options={(lookups.data?.employment_status ?? []).map((i) => ({ value: i.code, label: i.title }))} />
            </ToolbarFilter>
            <ToolbarFilter label="واحد" htmlFor="flt-unit" className="w-60">
              <Select id="flt-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="همه‌ی واحدها"
                options={(units.data ?? []).map((u) => ({ value: String(u.id), label: u.title }))} />
            </ToolbarFilter>
          </ListToolbar>
          <ResponsiveList rows={data.data?.results ?? []} columns={columns} rowKey={(r) => r.id} loading={data.isLoading} caption="پرونده‌های پرسنلی"
            rowHref={(r) => `/personnel/${r.id}`} sort={sort} onSortChange={(s) => setOrdering(s ? `${s.dir === "desc" ? "-" : ""}${s.key}` : "last_name")}
            empty={{ icon: Users, title: "پرونده‌ای پیدا نشد", description: q || unit || status !== "active" ? "فیلترها را تغییر دهید." : "اولین پرونده را ثبت کنید." }} />
          {(data.data?.count ?? 0) > PAGE && (
            <div className="flex justify-center border-t border-border p-3">
              <Pagination page={Number(page)} total={Math.ceil((data.data?.count ?? 0) / PAGE)} onChange={(p) => setPage(String(p))} size="sm" />
            </div>
          )}
        </Panel>
      )}
      {open && <NewEmployeeDialog onClose={() => setOpen(false)} onCreated={(id) => navigate(`/personnel/${id}`)} />}
    </>
  );
}

function NewEmployeeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const run = useApiAction();
  const initial: Values = { employment_status: "active" };
  const [values, setValues] = React.useState<Values>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...values, hire_date: values.hire_date || null, org_unit: values.org_unit || null };
    const r = await run(() => post<{ id: number }>("/personnel/employees/", body), "پرونده ساخته شد.");
    setBusy(false);
    if (r.ok && r.data) onCreated(r.data.id); else setErrors(r.fields ?? {});
  };
  return (
    <GuardedDialog open onOpenChange={(o) => !o && onClose()} dirty={JSON.stringify(values) !== JSON.stringify(initial)}
      title="پرونده‌ی پرسنلی جدید" description="بقیه‌ی اطلاعات را بعد از ساخت پرونده تکمیل کنید." className="max-w-2xl"
      footer={<><SubmitButton type="submit" form="new-employee" loading={busy}>ساخت پرونده</SubmitButton><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <form id="new-employee" onSubmit={save} noValidate>
        <FormRenderer schema={NEW_SCHEMA} values={values} onChange={setValues} errors={errors} />
      </form>
    </GuardedDialog>
  );
}
