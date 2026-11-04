import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FormInput, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SearchInput } from "@/components/ui/search-input";
import { get, post } from "@/app/api";
import { ErrorBlock, PageHeader, Panel, useUrlState } from "@/app/ui";
import { ListToolbar, matches, ResponsiveList, type Column } from "@/app/list";
import { fa } from "@/lib/utils";
import { NewKeyDialog, processState } from "@/core/workflow/ProcessListPage";
import type { FormRow } from "./FormBuilderPage";

export default function FormListPage() {
  const navigate = useNavigate();
  const [kind, setKind] = useUrlState("kind", "process");
  const [term, setTerm] = useUrlState("q");
  const [open, setOpen] = React.useState(false);
  const [entity, setEntity] = React.useState("");
  const q = useQuery({ queryKey: ["forms-all"], queryFn: () => get<FormRow[]>("/forms/") });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => get<{ entities: { code: string; title: string }[] }>("/system/catalog/") });
  const rows = (q.data ?? []).filter((f) => (kind === "process" ? !f.entity : !!f.entity) && matches(term, f.title, f.key, f.category));
  const columns: Column<FormRow>[] = [
    { key: "title", header: "عنوان فرم", primary: true, sortValue: (f) => f.title, cell: (f) => f.title },
    { key: "key", header: "کلید", cell: (f) => <bdi dir="ltr" className="text-sm text-muted-foreground">{f.key}</bdi>, hideOnMobile: true },
    kind === "process"
      ? { key: "category", header: "دسته", sortValue: (f) => f.category, cell: (f) => f.category || "—" }
      : { key: "entity", header: "فیلد سفارشی برای", cell: (f) => f.entity_title },
    { key: "version", header: "نسخه", numeric: true, cell: (f) => (f.latest_version ? fa(f.latest_version.version) : "—") },
    { key: "updated", header: "آخرین ویرایش", sortValue: (f) => f.updated_at, cell: (f) => <span className="tabular-nums">{fa(f.updated_at)}</span> },
    { key: "state", header: "وضعیت", cell: (f) => processState({ latest_version: f.latest_version, has_draft_changes: f.has_draft_changes }) },
  ];
  const openNew = () => { setEntity(kind === "entity" ? catalog.data?.entities[0]?.code ?? "" : ""); setOpen(true); };
  return (
    <>
      <PageHeader title="فرم‌ساز" description="فرم‌های فرایندها و فیلدهای سفارشی ماژول‌ها را بدون کدنویسی بسازید."
        actions={<Button onClick={openNew}><Plus className="size-4" aria-hidden /> فرم جدید</Button>} />
      {q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <Panel flush>
          <ListToolbar count={q.data ? rows.length : undefined}>
            <SegmentedControl value={kind} onChange={setKind} aria-label="نوع فرم" size="sm"
              options={[{ value: "process", label: "فرم‌های فرایند" }, { value: "entity", label: "فیلدهای سفارشی ماژول‌ها" }]} />
            <div className="w-full sm:w-72"><SearchInput value={term} onChange={setTerm} placeholder="عنوان یا کلید" aria-label="جست‌وجوی فرم" size="sm" /></div>
          </ListToolbar>
          <ResponsiveList rows={rows} columns={columns} rowKey={(f) => f.id} loading={q.isLoading} caption="فرم‌ها" rowHref={(f) => `/forms/${f.key}`}
            empty={{ icon: FormInput, title: kind === "process" ? "هنوز فرمی ساخته نشده است" : "هنوز فیلد سفارشی تعریف نشده است",
              description: kind === "entity" ? "مثلاً «اطلاعات تکمیلی پرسنل» با فیلدهای دلخواه سازمان شما." : undefined,
              action: <Button variant="outline" onClick={openNew}><Plus className="size-4" aria-hidden /> ساخت فرم</Button> }} />
        </Panel>
      )}
      <NewKeyDialog open={open} onOpenChange={setOpen} title="فرم جدید" keyHint="شناسه‌ی یکتا و غیرقابل‌تغییر، مثل purchase_form"
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
