import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { get, post } from "@/app/api";
import { LoadingBlock, PageHeader, useApiAction } from "@/app/ui";
import { fa } from "@/lib/utils";

type Startable = { id: number; key: string; title: string; description: string; category: string };

export default function NewRequestPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["startable"], queryFn: () => get<Startable[]>("/workflow/processes/startable/") });
  const [busy, setBusy] = React.useState<number | null>(null);
  const [term, setTerm] = React.useState("");

  const start = async (m: Startable) => {
    setBusy(m.id);
    const r = await run(() => post<{ instance_id: number; tracking_code: string; work_item_id: number | null }>(`/workflow/processes/${m.id}/start/`));
    setBusy(null);
    if (r.ok && r.data) {
      qc.invalidateQueries({ queryKey: ["inbox-counts"] });
      navigate(r.data.work_item_id ? `/tasks/${r.data.work_item_id}` : `/requests/${r.data.instance_id}`);
    }
  };

  const list = (q.data ?? []).filter((m) => !term || m.title.includes(term) || m.description.includes(term));
  const groups = Object.entries(list.reduce<Record<string, Startable[]>>((acc, m) => {
    (acc[m.category || "سایر"] ||= []).push(m);
    return acc;
  }, {}));

  return (
    <>
      <PageHeader title="ثبت درخواست جدید" description="نوع درخواست را انتخاب کنید."
        actions={<SearchInput value={term} onChange={setTerm} placeholder="جست‌وجوی فرایند" size="sm" />} />
      {q.isLoading ? <LoadingBlock /> : !groups.length ? (
        <EmptyState icon={GitBranch} title="فرایندی برای شما تعریف نشده است" description="با مدیر سامانه تماس بگیرید." />
      ) : groups.map(([cat, items]) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-base font-semibold">{cat} <span className="text-sm font-normal text-muted-foreground">({fa(items.length)})</span></h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <article key={m.id} className="flex min-h-44 flex-col gap-3 rounded-surface border-line border-border bg-card p-5 shadow-surface">
                <h3 className="text-base font-semibold leading-tight">{m.title}</h3>
                <p className="flex-1 text-sm text-muted-foreground">{m.description || "بدون توضیحات"}</p>
                <Button onClick={() => start(m)} disabled={busy === m.id} className="self-start">
                  {busy === m.id ? "در حال ایجاد…" : "شروع درخواست"} <ArrowLeft className="size-4" />
                </Button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
