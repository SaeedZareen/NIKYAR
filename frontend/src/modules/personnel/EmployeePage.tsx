import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { del, get, patch, post, put, type Paged } from "@/app/api";
import { useAuth } from "@/app/auth";
import { ErrorBlock, LoadingBlock, PageHeader, Panel, StatusBadge, useApiAction } from "@/app/ui";
import { FormRenderer } from "@/core/forms/FormRenderer";
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
  if (f.province || f.city) out.location = f.province ?? f.city;
  return out;
}

export default function EmployeePage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["employee", id], queryFn: () => get<Employee>(`/personnel/employees/${id}/`) });
  const units = useUnits();
  const [editing, setEditing] = React.useState(false);
  const [values, setValues] = React.useState<Values>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => { if (q.data) setValues(toForm(q.data)); }, [q.data]);

  if (q.isLoading) return <LoadingBlock rows={10} />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} />;
  const e = q.data;
  const canEdit = can("personnel.employee.edit");
  const unitId = Number(values.org_unit) || null;
  const positions = (units.data ?? []).filter((u) => !unitId || u.id === unitId).flatMap((u) => u.positions.map((p) => ({ value: String(p.id), label: p.title })));
  const empSchema = employmentSchema(positions);

  const save = async () => {
    const r = await run(() => patch<Employee>(`/personnel/employees/${id}/`, toPayload(values)), "پرونده ذخیره شد.");
    if (r.ok && r.data) { qc.setQueryData(["employee", id], r.data); qc.invalidateQueries({ queryKey: ["employees"] }); setEditing(false); setErrors({}); }
    else setErrors(mapErrors(r.fields ?? {}));
  };
  const cancel = () => { setValues(toForm(e)); setErrors({}); setEditing(false); };
  const sections = (
    [identitySchema, contactSchema, empSchema].map((s, i) => (
      <Panel key={i}>
        <FormRenderer schema={s} values={values} onChange={setValues} errors={errors} readOnly={!editing} />
      </Panel>
    ))
  );
  const children = CHILDREN.filter((c) => !c.sensitive || can("personnel.employee.sensitive"));

  return (
    <>
      <PageHeader crumbs={[{ label: "پرونده‌های پرسنلی", to: "/personnel" }]}
        title={<span className="flex items-center gap-3"><Avatar name={`${e.first_name} ${e.last_name}`} size="lg" />{e.first_name} {e.last_name}</span>}
        description={<span className="flex flex-wrap items-center gap-2">
          کد پرسنلی {fa(e.personnel_code)} · {e.job_title || e.position_title || "بدون سمت"}{e.org_unit_title ? ` · ${e.org_unit_title}` : ""}
          <StatusBadge status={e.employment_status} label={e.employment_status_title} />
        </span>}
        actions={canEdit && (editing ? (
          <>
            <Button onClick={save}><Save className="size-4" /> ذخیره‌ی تغییرات</Button>
            <Button variant="ghost" onClick={cancel}><X className="size-4" /> انصراف</Button>
          </>
        ) : <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" /> ویرایش اطلاعات اصلی</Button>)} />
      <Tabs defaultValue="main" variant="underline">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="main">اطلاعات اصلی</TabsTrigger>
            {children.map((c) => <TabsTrigger key={c.key} value={c.key}>{c.title} {e.counts[c.key] ? `(${fa(e.counts[c.key])})` : ""}</TabsTrigger>)}
            <TabsTrigger value="custom">اطلاعات تکمیلی</TabsTrigger>
            <TabsTrigger value="audit">سوابق تغییرات</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="main"><div className="space-y-6">{sections}</div></TabsContent>
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
  if (v === null || v === undefined || v === "") return "—";
  return fa(String(v));
}

function ChildTab({ def, employeeId, canEdit, onChanged }: { def: ChildDef; employeeId: number; canEdit: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const run = useApiAction();
  const key = ["child", def.key, employeeId];
  const q = useQuery({ queryKey: key, queryFn: () => get<Values[]>(`${def.endpoint}?employee=${employeeId}`) });
  const [edit, setEdit] = React.useState<Values | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [remove, setRemove] = React.useState<Values | null>(null);
  const isDoc = def.key === "documents";
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); onChanged(); };

  const save = async () => {
    const body: Values = { ...edit, employee: employeeId };
    if (isDoc) body.attachment = Array.isArray(edit?.attachment) ? (edit!.attachment as number[])[0] : edit?.attachment;
    for (const f of def.schema.sections[0].fields) if (f.type === "date" && !body[f.key]) body[f.key] = null;
    const id = edit?.id;
    const r = await run(() => (id ? patch(`${def.endpoint}${id}/`, body) : post(def.endpoint, body)), "ذخیره شد.");
    if (r.ok) { setEdit(null); setErrors({}); refresh(); } else setErrors(r.fields ?? {});
  };

  return (
    <Panel title={def.title} bodyClassName="p-0"
      actions={canEdit && <Button size="sm" onClick={() => { setErrors({}); setEdit({}); }}><Plus className="size-4" /> افزودن</Button>}>
      {q.isLoading ? <div className="p-5"><LoadingBlock rows={3} /></div> : !q.data?.length ? <EmptyState title={def.empty} /> : (
        <div className="overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader><TableRow>{def.columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}{(canEdit || isDoc) && <TableHead className="w-32">عملیات</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {q.data.map((row) => (
                <TableRow key={String(row.id)}>
                  {def.columns.map((c) => (
                    <TableCell key={c.key} dir={["iban", "card_number", "national_id"].includes(c.key) ? "ltr" : undefined}
                      className={["iban", "card_number", "national_id"].includes(c.key) ? "text-end" : undefined}>{cellText(row[c.key])}</TableCell>
                  ))}
                  {(canEdit || isDoc) && (
                    <TableCell>
                      <div className="flex">
                        {isDoc && <a href={`/api/files/${row.attachment}/?download=1`} aria-label="دریافت فایل" className="inline-flex size-10 items-center justify-center rounded-control hover:bg-accent"><Download className="size-4" /></a>}
                        {canEdit && <Button variant="ghost" size="icon" aria-label="ویرایش" onClick={() => { setErrors({}); setEdit({ ...row, attachment: row.attachment ? [row.attachment] : [] }); }}><Pencil className="size-4" /></Button>}
                        {canEdit && <Button variant="ghost" size="icon" aria-label="حذف" className="text-destructive" onClick={() => setRemove(row)}><Trash2 className="size-4" /></Button>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)} title={`${edit.id ? "ویرایش" : "افزودن"} ${def.schema.sections[0].title}`} className="max-w-2xl"
          footer={<><Button onClick={save}>ذخیره</Button><Button variant="ghost" onClick={() => setEdit(null)}>انصراف</Button></>}>
          <FormRenderer schema={{ sections: def.schema.sections.map((s) => ({ ...s, title: "" })) }} values={edit} onChange={setEdit} errors={errors} />
        </Dialog>
      )}
      <AlertDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} destructive title="حذف ردیف" confirmText="حذف"
        description="این ردیف از پرونده حذف می‌شود و در سوابق تغییرات ثبت می‌شود."
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
  React.useEffect(() => { if (q.data) setValues(q.data.values ?? {}); }, [q.data]);
  if (q.isLoading) return <LoadingBlock />;
  if (!q.data?.forms.length) {
    return (
      <EmptyState title="فیلد سفارشی تعریف نشده است"
        description={can("core.forms.manage") ? "در «فرم‌ساز» یک فرم با کاربرد «فیلد سفارشی: پرونده‌ی پرسنلی» بسازید و منتشر کنید تا اینجا نمایش داده شود." : "مدیر سامانه می‌تواند بدون برنامه‌نویسی فیلد جدید به پرونده اضافه کند."} />
    );
  }
  const save = async () => {
    const r = await run(() => put(`/personnel/employees/${employeeId}/custom/`, { data: values }), "اطلاعات تکمیلی ذخیره شد.");
    if (r.ok) { setEditing(false); setErrors({}); qc.invalidateQueries({ queryKey: ["emp-custom", employeeId] }); } else setErrors(r.fields ?? {});
  };
  return (
    <div className="space-y-6">
      <Alert>این بخش را سازمان شما با فرم‌ساز و بدون برنامه‌نویسی تعریف کرده است.</Alert>
      {q.data.forms.map((f) => (
        <Panel key={f.key} title={f.title}>
          <FormRenderer schema={f.schema} values={values[f.key] ?? {}} onChange={(v) => setValues({ ...values, [f.key]: v })} errors={errors} readOnly={!editing} />
        </Panel>
      ))}
      {canEdit && (editing ? (
        <div className="flex gap-2"><Button onClick={save}><Save className="size-4" /> ذخیره</Button><Button variant="ghost" onClick={() => { setEditing(false); setValues(q.data!.values ?? {}); }}>انصراف</Button></div>
      ) : <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" /> ویرایش اطلاعات تکمیلی</Button>)}
    </div>
  );
}

function EmployeeAudit({ employeeId }: { employeeId: number }) {
  const q = useQuery({ queryKey: ["emp-audit", employeeId], queryFn: () => get<Paged<AuditRow>>(`/audit/?entity=personnel.employee&object_id=${employeeId}`) });
  return <Panel bodyClassName="p-0">{q.isLoading ? <div className="p-5"><LoadingBlock /></div> : <AuditTable rows={q.data?.results ?? []} />}</Panel>;
}
