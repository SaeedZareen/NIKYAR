import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GitBranch } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { get, post } from "@/app/api";
import { ErrorBlock, LoadingBlock, PageHeader, SubmitButton, useApiAction, useUrlState } from "@/app/ui";
import { matches } from "@/app/list";
import { fa } from "@/lib/utils";

type Startable = { id: number; key: string; title: string; description: string; category: string };

export default function NewRequestPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["startable"], queryFn: () => get<Startable[]>("/workflow/processes/startable/") });
  const [busy, setBusy] = React.useState<number | null>(null);
  const [term, setTerm] = useUrlState("q");

  const start = async (m: Startable) => {
    setBusy(m.id);
    const r = await run(() => post<{ instance_id: number; tracking_code: string; work_item_id: number | null }>(`/workflow/processes/${m.id}/start/`));
    setBusy(null);
    if (r.ok && r.data) {
      qc.invalidateQueries({ queryKey: ["inbox-counts"] });
      navigate(r.data.work_item_id ? `/tasks/${r.data.work_item_id}` : `/requests/${r.data.instance_id}`);
    }
  };

  const list = (q.data ?? []).filter((m) => matches(term, m.title, m.description, m.category));
  const groups = Object.entries(list.reduce<Record<string, Startable[]>>((acc, m) => {
    (acc[m.category || "سایر"] ||= []).push(m);
    return acc;
  }, {}));

  return (
    <>
      <PageHeader title="ثبت درخواست جدید" description="نوع درخواست را انتخاب کنید؛ پس از شروع، فرم مرحله‌ی اول باز می‌شود." />
      <div className="mb-6 w-full sm:w-96">
        <SearchInput value={term} onChange={setTerm} placeholder="جست‌وجوی نوع درخواست" aria-label="جست‌وجوی نوع درخواست" />
      </div>
      {q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingBlock /> : !groups.length ? (
        <EmptyState icon={GitBranch} title={term ? "درخواستی با این نام پیدا نشد" : "فرایندی برای شما تعریف نشده است"}
          description={term ? "عبارت دیگری را امتحان کنید." : "برای دسترسی به فرایندها با مدیر سامانه تماس بگیرید."} />
      ) : groups.map(([cat, items]) => (
        <section key={cat} className="mb-8" aria-labelledby={`cat-${cat}`}>
          <h2 id={`cat-${cat}`} className="mb-3 text-lg font-semibold">{cat} <span className="text-sm font-normal text-muted-foreground">({fa(items.length)})</span></h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <li key={m.id} className="flex min-h-40 flex-col gap-3 rounded-surface border-line border-border bg-card p-5 shadow-surface">
                <h3 className="text-base font-semibold leading-tight">{m.title}</h3>
                <p className="flex-1 text-sm text-muted-foreground">{m.description || "بدون توضیحات"}</p>
                <SubmitButton onClick={() => start(m)} loading={busy === m.id} disabled={busy !== null} loadingText="در حال ایجاد…" className="self-start"
                  aria-label={`شروع درخواست ${m.title}`}>
                  شروع درخواست <ArrowLeft className="size-4" aria-hidden />
                </SubmitButton>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
