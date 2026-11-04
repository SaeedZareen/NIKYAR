import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { FormField } from "@/components/ui/form";
import { get, post } from "@/app/api";
import { ErrorBlock, ErrorSummary, GuardedDialog, PageHeader, Panel, StatusBadge, SubmitButton, useApiAction, useUrlState } from "@/app/ui";
import { ListToolbar, matches, ResponsiveList, type Column } from "@/app/list";
import { fa } from "@/lib/utils";
import type { ProcessModel } from "./ProcessDesignerPage";

export function processState(p: { is_active?: boolean; latest_version: unknown; has_draft_changes: boolean }) {
  if (p.is_active === false) return <StatusBadge tone="neutral" label="غیرفعال" />;
  if (!p.latest_version) return <StatusBadge tone="warning" label="پیش‌نویس" />;
  if (p.has_draft_changes) return <StatusBadge tone="warning" label="تغییرات منتشرنشده" />;
  return <StatusBadge tone="success" label="منتشرشده" />;
}

export default function ProcessListPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["processes"], queryFn: () => get<ProcessModel[]>("/workflow/processes/") });
  const [term, setTerm] = useUrlState("q");
  const [open, setOpen] = React.useState(false);
  const rows = (q.data ?? []).filter((p) => matches(term, p.title, p.key, p.category));
  const columns: Column<ProcessModel>[] = [
    { key: "title", header: "نام فرایند", primary: true, sortValue: (p) => p.title, cell: (p) => p.title },
    { key: "key", header: "کلید", cell: (p) => <bdi dir="ltr" className="text-sm text-muted-foreground">{p.key}</bdi>, hideOnMobile: true },
    { key: "category", header: "دسته", sortValue: (p) => p.category, cell: (p) => p.category || "—" },
    { key: "form", header: "فرم", cell: (p) => p.form_title || <span className="text-muted-foreground">بدون فرم</span> },
    { key: "version", header: "نسخه", numeric: true, cell: (p) => (p.latest_version ? fa(p.latest_version.version) : "—") },
    { key: "count", header: "درخواست‌ها", numeric: true, sortValue: (p) => p.instance_count, cell: (p) => fa(p.instance_count) },
    { key: "state", header: "وضعیت", cell: processState },
  ];
  return (
    <>
      <PageHeader title="فرایندساز" description="فرایندهای سازمان را طراحی، نسخه‌بندی و منتشر کنید."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> فرایند جدید</Button>} />
      {q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <Panel flush>
          <ListToolbar count={q.data ? rows.length : undefined}>
            <div className="w-full sm:w-80"><SearchInput value={term} onChange={setTerm} placeholder="نام، کلید یا دسته" aria-label="جست‌وجوی فرایند" size="sm" /></div>
          </ListToolbar>
          <ResponsiveList rows={rows} columns={columns} rowKey={(p) => p.id} loading={q.isLoading} caption="فرایندها" rowHref={(p) => `/processes/${p.id}`}
            empty={{ icon: GitBranch, title: term ? "فرایندی با این نام پیدا نشد" : "هنوز فرایندی تعریف نشده است",
              action: !term && <Button variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> ساخت اولین فرایند</Button> }} />
        </Panel>
      )}
      <NewKeyDialog open={open} onOpenChange={setOpen} title="فرایند جدید" keyHint="شناسه‌ی یکتا و غیرقابل‌تغییر، مثل purchase_request"
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
  const [busy, setBusy] = React.useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => onCreate(f.title, f.key));
    setBusy(false);
    if (!r.ok) setErrors(r.fields ?? {});
  };
  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} dirty={!!(f.title || f.key)} title={title}
      footer={<><SubmitButton type="submit" form="new-key-form" loading={busy} disabled={!f.title || !f.key}>ایجاد</SubmitButton><Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button></>}>
      <form id="new-key-form" onSubmit={create} className="space-y-4" noValidate>
        <ErrorSummary errors={errors} labels={{ title: "عنوان", key: "کلید لاتین" }} />
        <FormField label="عنوان" htmlFor="f-title" required error={errors.title}>
          <Input id="f-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
        </FormField>
        <FormField label="کلید لاتین" htmlFor="f-key" required hint={keyHint} error={errors.key}>
          <Input id="f-key" dir="ltr" value={f.key} autoComplete="off" spellCheck={false}
            onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
        </FormField>
        {extra}
      </form>
    </GuardedDialog>
  );
}
