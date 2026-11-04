import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form";
import { get, post } from "@/app/api";
import { PageHeader, useApiAction } from "@/app/ui";
import { fa } from "@/lib/utils";
import type { ProcessModel } from "./ProcessDesignerPage";

export default function ProcessListPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["processes"], queryFn: () => get<ProcessModel[]>("/workflow/processes/") });
  const [open, setOpen] = React.useState(false);
  const columns: Column<ProcessModel & Record<string, unknown>>[] = [
    { key: "title", header: "نام فرایند", cell: (p) => <span><span className="block font-medium">{p.title}</span><span dir="ltr" className="text-xs text-muted-foreground">{p.key}</span></span> },
    { key: "category", header: "دسته" },
    { key: "form_title", header: "فرم", cell: (p) => p.form_title || "—" },
    { key: "latest_version", header: "نسخه", cell: (p) => (p.latest_version ? fa(p.latest_version.version) : "—") },
    { key: "instance_count", header: "تعداد درخواست", numeric: true, cell: (p) => fa(p.instance_count) },
    { key: "is_active", header: "وضعیت", cell: (p) => !p.is_active ? <Badge variant="secondary">غیرفعال</Badge>
      : !p.latest_version ? <Badge variant="warning">پیش‌نویس</Badge>
      : p.has_draft_changes ? <Badge variant="warning">تغییرات منتشرنشده</Badge> : <Badge variant="success">منتشرشده</Badge> },
  ];
  return (
    <>
      <PageHeader title="فرایندساز" description="فرایندهای سازمان را طراحی، نسخه‌بندی و منتشر کنید."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> فرایند جدید</Button>} />
      <DataTable rows={(q.data ?? []) as (ProcessModel & Record<string, unknown>)[]} columns={columns} rowKey={(p) => String(p.id)}
        loading={q.isLoading} searchKeys={["title", "key", "category"]} emptyTitle="هنوز فرایندی تعریف نشده است"
        onRowClick={(p) => navigate(`/processes/${p.id}`)} pageSize={15} />
      <NewKeyDialog open={open} onOpenChange={setOpen} title="فرایند جدید" keyHint="شناسه‌ی یکتا و غیرقابل تغییر، مثل purchase_request"
        onCreate={(title, key) => post<ProcessModel>("/workflow/processes/", { title, key }).then((p) => navigate(`/processes/${p.id}`))} />
    </>
  );
}

export function NewKeyDialog({ open, onOpenChange, title, keyHint, onCreate, extra }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; keyHint: string;
  onCreate: (title: string, key: string) => Promise<unknown>; extra?: React.ReactNode;
}) {
  const run = useApiAction();
  const [f, setF] = React.useState({ title: "", key: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const create = async () => {
    const r = await run(() => onCreate(f.title, f.key));
    if (!r.ok) setErrors(r.fields ?? {});
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}
      footer={<><Button onClick={create} disabled={!f.title || !f.key}>ایجاد</Button><Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button></>}>
      <div className="space-y-4">
        <FormField label="عنوان" htmlFor="nk-title" required error={errors.title}>
          <Input id="nk-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </FormField>
        <FormField label="کلید لاتین" htmlFor="nk-key" required hint={keyHint} error={errors.key}>
          <Input id="nk-key" dir="ltr" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
        </FormField>
        {extra}
      </div>
    </Dialog>
  );
}
