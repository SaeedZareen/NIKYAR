import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { get, post } from "@/app/api";
import { PageHeader } from "@/app/ui";
import { fa } from "@/lib/utils";
import { NewKeyDialog } from "@/core/workflow/ProcessListPage";
import type { FormRow } from "./FormBuilderPage";

export default function FormListPage() {
  const navigate = useNavigate();
  const [kind, setKind] = React.useState<"process" | "entity">("process");
  const [open, setOpen] = React.useState(false);
  const [entity, setEntity] = React.useState("");
  const q = useQuery({ queryKey: ["forms-all"], queryFn: () => get<FormRow[]>("/forms/") });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => get<{ entities: { code: string; title: string }[] }>("/system/catalog/") });
  const rows = (q.data ?? []).filter((f) => (kind === "process" ? !f.entity : !!f.entity));
  const columns: Column<FormRow & Record<string, unknown>>[] = [
    { key: "title", header: "عنوان فرم", cell: (f) => <span><span className="block font-medium">{f.title}</span><span dir="ltr" className="text-xs text-muted-foreground">{f.key}</span></span> },
    kind === "process" ? { key: "category", header: "دسته" } : { key: "entity_title", header: "فیلد سفارشی برای" },
    { key: "latest_version", header: "نسخه", cell: (f) => (f.latest_version ? fa(f.latest_version.version) : "—") },
    { key: "updated_at", header: "آخرین ویرایش", cell: (f) => fa(f.updated_at) },
    { key: "has_draft_changes", header: "وضعیت", cell: (f) => !f.latest_version ? <Badge variant="warning">پیش‌نویس</Badge>
      : f.has_draft_changes ? <Badge variant="warning">تغییرات منتشرنشده</Badge> : <Badge variant="success">منتشرشده</Badge> },
  ];
  return (
    <>
      <PageHeader title="فرم‌ساز" description="فرم‌های فرایندها و فیلدهای سفارشی ماژول‌ها را بدون کدنویسی بسازید."
        actions={<Button onClick={() => { setEntity(kind === "entity" ? catalog.data?.entities[0]?.code ?? "" : ""); setOpen(true); }}><Plus className="size-4" /> فرم جدید</Button>} />
      <div className="mb-4">
        <SegmentedControl value={kind} onChange={(v) => setKind(v as "process")} aria-label="نوع فرم"
          options={[{ value: "process", label: "فرم‌های فرایند" }, { value: "entity", label: "فیلدهای سفارشی ماژول‌ها" }]} />
      </div>
      <DataTable rows={rows as (FormRow & Record<string, unknown>)[]} columns={columns} rowKey={(f) => String(f.id)} loading={q.isLoading}
        searchKeys={["title", "key"]} emptyTitle={kind === "process" ? "هنوز فرمی ساخته نشده است" : "هنوز فیلد سفارشی تعریف نشده است"}
        emptyDescription={kind === "entity" ? "مثلاً «اطلاعات تکمیلی پرسنل» با فیلدهای دلخواه سازمان شما." : undefined}
        onRowClick={(f) => navigate(`/forms/${f.key}`)} pageSize={15} />
      <NewKeyDialog open={open} onOpenChange={setOpen} title="فرم جدید" keyHint="شناسه‌ی یکتا و غیرقابل تغییر، مثل purchase_form"
        onCreate={(title, key) => post<FormRow>("/forms/", { title, key, entity }).then((f) => navigate(`/forms/${f.key}`))}
        extra={
          <FormField label="کاربرد فرم" htmlFor="nf-entity" hint="فرم فرایند در فرایندساز انتخاب می‌شود؛ فیلد سفارشی مستقیم در صفحه‌ی ماژول نمایش داده می‌شود.">
            <Select id="nf-entity" value={entity} onChange={(e) => setEntity(e.target.value)}
              options={[{ value: "", label: "فرم فرایند" }, ...(catalog.data?.entities ?? []).map((e) => ({ value: e.code, label: `فیلد سفارشی: ${e.title}` }))]} />
          </FormField>
        } />
    </>
  );
}
