import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { del, get, patch, post, put, type Paged } from "@/app/api";
import { useAuth } from "@/app/auth";
import { ErrorBlock, PageError, ErrorSummary, GuardedDialog, LoadingBlock, PageHeader, Panel, StatusBadge, SubmitButton, useApiAction, useUrlState } from "@/app/ui";
import { ResponsiveList, type Column } from "@/app/list";
import { FormRenderer, labelsOf } from "@/core/forms/FormRenderer";
import { useUnits } from "@/core/forms/useFormRefs";
import type { FormSchema, Values } from "@/core/forms/types";
import { AuditTable, type AuditRow } from "@/core/system/AuditPage";
import { fa } from "@/lib/utils";
import { CHILDREN, contactSchema, employmentSchema, identitySchema, type ChildDef } from "./schemas";

export type Employee = Values & {
  id: number; personnel_code: string; first_name: string; last_name: string; full_name: string; employment_status: string;
  employment_status_title: string; org_unit_title: string; position_title: string; job_title: string; province: string; city: string;
  counts: Record<string, number>;
};

function toForm(e: Employee): Values {
  return { ...e, location: { province: e.province ?? "", city: e.city ?? "" }, position: e.position ? String(e.position) : "" };
}
const MAIN_KEYS = [identitySchema, contactSchema, employmentSchema([])].flatMap((s) => s.sections.flatMap((x) => x.fields.map((f) => f.key)));
const MAIN_LABELS = { ...labelsOf(identitySchema), ...labelsOf(contactSchema), ...labelsOf(employmentSchema([])), province: "استان", city: "شهر" };

function toPayload(v: Values): Values {
  const out: Values = {};
  for (const k of MAIN_KEYS) if (k in v) out[k] = v[k] ?? "";
  const loc = (v.location ?? {}) as { province?: string; city?: string };
  delete out.location;
  out.province = loc.province ?? "";
  out.city = loc.city ?? "";
  out.position = v.position ? Number(v.position) : null;
  out.org_unit = v.org_unit ? Number(v.org_unit) : null;
  out.user = v.user ? Number(v.user) : null;
  for (const k of ["birth_date", "hire_date", "leave_date"]) if (!out[k]) out[k] = null;
  return out;
}
function mapErrors(f: Record<string, string>) {
  const out = { ...f };
  if (f.province || f.city) { out.location = f.province ?? f.city; delete out.province; delete out.city; }
  return out;
}

export default function EmployeePage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["employee", id], queryFn: () => get<Employee>(`/personnel/employees/${id}/`) });
  const units = useUnits();
  const [tab, setTab] = useUrlState("tab", "main");
  const [editing, setEditing] = React.useState(false);
  const [values, setValues] = React.useState<Values>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (q.data && !editing) setValues(toForm(q.data)); }, [q.data, editing]);
  const dirty = editing && !!q.data && JSON.stringify(values) !== JSON.stringify(toForm(q.data));
  React.useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (q.isLoading) return <LoadingBlock rows={10} />;
  if (q.error || !q.data) return <PageError error={q.error} onRetry={() => q.refetch()} back={{ to: "/personnel", label: "پرونده‌های پرسنلی" }} />;
  const e = q.data;
  const canEdit = can("personnel.employee.edit");
  const unitId = Number(values.org_unit) || null;
  const positions = (units.data ?? []).filter((u) => !unitId || u.id === unitId).flatMap((u) => u.positions.map((p) => ({ value: String(p.id), label: p.title })));
  const empSchema = employmentSchema(positions);

  const save = async () => {
    setBusy(true);
    const r = await run(() => patch<Employee>(`/personnel/employees/${id}/`, toPayload(values)), "پرونده ذخیره شد.");
    setBusy(false);
    if (r.ok && r.data) { qc.setQueryData(["employee", id], r.data); qc.invalidateQueries({ queryKey: ["employees"] }); setEditing(false); setErrors({}); }
    else setErrors(mapErrors(r.fields ?? {}));
  };
  const cancel = () => { setValues(toForm(e)); setErrors({}); setEditing(false); };
  const children = CHILDREN.filter((c) => !c.sensitive || can("personnel.employee.sensitive"));
  const name = `${e.first_name} ${e.last_name}`;

  return (
    <>
      <PageHeader docTitle={name} crumbs={[{ label: "پرونده‌های پرسنلی", to: "/personnel" }, { label: name }]}
        title={<span className="flex items-center gap-3"><Avatar name={name} size="md" />{name}</span>}
        description={<span className="flex flex-wrap items-center gap-2">
          کد پرسنلی <bdi className="tabular-nums">{fa(e.personnel_code)}</bdi> · {e.job_title || e.position_title || "بدون سمت"}{e.org_unit_title ? ` · ${e.org_unit_title}` : ""}
          <StatusBadge status={e.employment_status} label={e.employment_status_title} />
        </span>}
        actions={canEdit && tab === "main" && (editing ? (
          <>
            <SubmitButton onClick={save} loading={busy} disabled={!dirty}><Save className="size-4" aria-hidden /> ذخیره‌ی تغییرات</SubmitButton>
            <Button variant="ghost" onClick={cancel}><X className="size-4" aria-hidden /> انصراف</Button>
          </>
        ) : <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden /> ویرایش اطلاعات اصلی</Button>)} />
      <Tabs value={tab} defaultValue="main" onValueChange={(v) => { if (!dirty) setTab(v); }} variant="underline">
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList>
            <TabsTrigger value="main">اطلاعات اصلی</TabsTrigger>
            {children.map((c) => <TabsTrigger key={c.key} value={c.key}>{c.title}{e.counts[c.key] ? ` (${fa(e.counts[c.key])})` : ""}</TabsTrigger>)}
            <TabsTrigger value="custom">اطلاعات تکمیلی</TabsTrigger>
            <TabsTrigger value="audit">سوابق تغییرات</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="main">
          {dirty && <Alert variant="warning" className="mb-4">تغییرات ذخیره نشده‌اند. برای رفتن به زبانه‌ی دیگر، ابتدا ذخیره یا انصراف را بزنید.</Alert>}
          {editing && <ErrorSummary errors={errors} labels={MAIN_LABELS} />}
          <div className="space-y-6">
            {[identitySchema, contactSchema, empSchema].map((s) => (
              <Panel key={s.sections[0].id} title={s.sections[0].title}>
                <FormRenderer schema={{ sections: s.sections.map((x) => ({ ...x, title: "" })) }} values={values} onChange={setValues}
                  errors={errors} readOnly={!editing} summary={false} />
              </Panel>
            ))}
          </div>
        </TabsContent>
        {children.map((c) => (
          <TabsContent key={c.key} value={c.key}>
            <ChildTab def={c} employeeId={Number(id)} canEdit={canEdit} onChanged={() => qc.invalidateQueries({ queryKey: ["employee", id] })} />
          </TabsContent>
        ))}
        <TabsContent value="custom"><CustomFields employeeId={Number(id)} canEdit={canEdit} /></TabsContent>
        <TabsContent value="audit"><EmployeeAudit employeeId={Number(id)} /></TabsContent>
      </Tabs>
    </>
  );
}

function cellText(v: unknown): React.ReactNode {
  if (typeof v === "boolean") return v ? "بله" : "خیر";
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  return fa(String(v));
}
const LTR = ["iban", "card_number", "national_id"];

function ChildTab({ def, employeeId, canEdit, onChanged }: { def: ChildDef; employeeId: number; canEdit: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const run = useApiAction();
  const key = ["child", def.key, employeeId];
  const q = useQuery({ queryKey: key, queryFn: () => get<Values[]>(`${def.endpoint}?employee=${employeeId}`) });
  const [edit, setEdit] = React.useState<{ initial: Values; values: Values } | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [remove, setRemove] = React.useState<Values | null>(null);
  const isDoc = def.key === "documents";
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); onChanged(); };
  const formTitle = def.schema.sections[0].title;
  const open = (row?: Values) => {
    const v = row ? { ...row, attachment: row.attachment ? [row.attachment] : [] } : {};
    setErrors({});
    setEdit({ initial: v, values: v });
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!edit) return;
    const body: Values = { ...edit.values, employee: employeeId };
    if (isDoc) body.attachment = Array.isArray(edit.values.attachment) ? (edit.values.attachment as number[])[0] : edit.values.attachment;
    for (const f of def.schema.sections[0].fields) if (f.type === "date" && !body[f.key]) body[f.key] = null;
    const id = edit.values.id;
    setBusy(true);
    const r = await run(() => (id ? patch(`${def.endpoint}${id}/`, body) : post(def.endpoint, body)), "ذخیره شد.");
    setBusy(false);
    if (r.ok) { setEdit(null); setErrors({}); refresh(); } else setErrors(r.fields ?? {});
  };

  const columns: Column<Values>[] = def.columns.map((c, i) => ({
    key: c.key, header: c.label, primary: i === 0,
    cell: (row) => (LTR.includes(c.key) ? <bdi dir="ltr" className="tabular-nums">{cellText(row[c.key])}</bdi> : cellText(row[c.key])),
  }));

  return (
    <Panel title={def.title} flush
      actions={canEdit && <Button variant="outline" onClick={() => open()}><Plus className="size-4" aria-hidden /> افزودن {formTitle}</Button>}>
      <ResponsiveList rows={q.data ?? []} columns={columns} rowKey={(r) => String(r.id)} loading={q.isLoading} caption={def.title}
        rowActions={(canEdit || isDoc) ? (row) => (
          <span className="inline-flex">
            {isDoc && <a href={`/api/files/${row.attachment}/?download=1`} aria-label={`دریافت فایل ${String(row.title || row.attachment_name || "")}`}
              className="inline-flex size-10 items-center justify-center rounded-control hover:bg-accent"><Download className="size-4" aria-hidden /></a>}
            {canEdit && <Button variant="ghost" size="icon" aria-label={`ویرایش ${formTitle}`} onClick={() => open(row)}><Pencil className="size-4" aria-hidden /></Button>}
            {canEdit && <Button variant="ghost" size="icon" aria-label={`حذف ${formTitle}`} className="text-destructive" onClick={() => setRemove(row)}><Trash2 className="size-4" aria-hidden /></Button>}
          </span>
        ) : undefined}
        empty={{ title: def.empty, action: canEdit && <Button variant="outline" onClick={() => open()}><Plus className="size-4" aria-hidden /> افزودن</Button> }} />
      {edit && (
        <GuardedDialog open onOpenChange={(o) => !o && setEdit(null)} dirty={JSON.stringify(edit.values) !== JSON.stringify(edit.initial)}
          title={`${edit.values.id ? "ویرایش" : "افزودن"} ${formTitle}`} className="max-w-2xl"
          footer={<><SubmitButton type="submit" form={`child-${def.key}`} loading={busy}>ذخیره</SubmitButton><Button variant="ghost" onClick={() => setEdit(null)}>انصراف</Button></>}>
          <form id={`child-${def.key}`} onSubmit={save} noValidate>
            <FormRenderer schema={{ sections: def.schema.sections.map((s) => ({ ...s, title: "" })) }} values={edit.values}
              onChange={(v) => setEdit({ ...edit, values: v })} errors={errors} />
          </form>
        </GuardedDialog>
      )}
      <AlertDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} destructive title={`حذف ${formTitle}`} confirmText="حذف"
        description="این ردیف از پرونده حذف و در سوابق تغییرات ثبت می‌شود."
        onConfirm={async () => { const r = remove!; setRemove(null); await run(() => del(`${def.endpoint}${r.id}/`), "حذف شد."); refresh(); }} />
    </Panel>
  );
}

function CustomFields({ employeeId, canEdit }: { employeeId: number; canEdit: boolean }) {
  const run = useApiAction();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["emp-custom", employeeId], queryFn: () => get<{ forms: { key: string; title: string; schema: FormSchema }[]; values: Record<string, Values> }>(`/personnel/employees/${employeeId}/custom/`) });
  const [values, setValues] = React.useState<Record<string, Values>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (q.data) setValues(q.data.values ?? {}); }, [q.data]);
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.forms.length) {
    return (
      <EmptyState title="فیلد سفارشی تعریف نشده است"
        description={can("core.forms.manage") ? "در «فرم‌ساز» یک فرم با کاربرد «فیلد سفارشی: پرونده‌ی پرسنلی» بسازید و منتشر کنید تا اینجا نمایش داده شود." : "مدیر سامانه می‌تواند بدون برنامه‌نویسی فیلد جدید به پرونده اضافه کند."} />
    );
  }
  const labels = Object.assign({}, ...q.data.forms.map((f) => labelsOf(f.schema)));
  const save = async () => {
    setBusy(true);
    const r = await run(() => put(`/personnel/employees/${employeeId}/custom/`, { data: values }), "اطلاعات تکمیلی ذخیره شد.");
    setBusy(false);
    if (r.ok) { setEditing(false); setErrors({}); qc.invalidateQueries({ queryKey: ["emp-custom", employeeId] }); } else setErrors(r.fields ?? {});
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">این بخش را سازمان شما با فرم‌ساز و بدون برنامه‌نویسی تعریف کرده است.</p>
        {canEdit && (editing ? (
          <div className="flex gap-2">
            <SubmitButton onClick={save} loading={busy}><Save className="size-4" aria-hidden /> ذخیره</SubmitButton>
            <Button variant="ghost" onClick={() => { setEditing(false); setErrors({}); setValues(q.data!.values ?? {}); }}>انصراف</Button>
          </div>
        ) : <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden /> ویرایش اطلاعات تکمیلی</Button>)}
      </div>
      {editing && <ErrorSummary errors={errors} labels={labels} />}
      {q.data.forms.map((f) => (
        <Panel key={f.key} title={f.title}>
          <FormRenderer schema={f.schema} values={values[f.key] ?? {}} onChange={(v) => setValues({ ...values, [f.key]: v })} errors={errors} readOnly={!editing} summary={false} />
        </Panel>
      ))}
    </div>
  );
}

function EmployeeAudit({ employeeId }: { employeeId: number }) {
  const q = useQuery({ queryKey: ["emp-audit", employeeId], queryFn: () => get<Paged<AuditRow>>(`/audit/?entity=personnel.employee&object_id=${employeeId}`) });
  return (
    <Panel title="سوابق تغییرات پرونده" flush>
      {q.error ? <div className="p-5"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></div> : q.isLoading ? <div className="p-5"><LoadingBlock /></div> : <AuditTable rows={q.data?.results ?? []} />}
    </Panel>
  );
}
