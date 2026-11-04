import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileSearch, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { get, post } from "@/app/api";
import { useAuth } from "@/app/auth";
import { PageError, GuardedDialog, KeyValue, LoadingBlock, PageHeader, Panel, StatusBadge, SubmitButton, useApiAction } from "@/app/ui";
import { FormRenderer } from "@/core/forms/FormRenderer";
import { useUsersBrief } from "@/core/forms/useFormRefs";
import type { Values } from "@/core/forms/types";
import { fa } from "@/lib/utils";
import type { TaskDetail } from "./types";

/** پیش‌نویس محلی فرم کار (form-autosave)؛ فقط در مرورگر همین کاربر */
function useDraft(key: string) {
  const read = React.useCallback((): { values: Values; comment: string } | null => {
    try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
  }, [key]);
  const write = React.useCallback((d: { values: Values; comment: string }) => {
    try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* حالت خصوصی */ }
  }, [key]);
  const clear = React.useCallback(() => { try { localStorage.removeItem(key); } catch { /* */ } }, [key]);
  return { read, write, clear };
}

export default function TaskPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["task", id], queryFn: () => get<TaskDetail>(`/workflow/inbox/${id}/`) });
  const draft = useDraft(`nikyar:draft:task:${id}`);
  const [values, setValues] = React.useState<Values>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [referOpen, setReferOpen] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (!q.data || loaded.current) return;
    loaded.current = true;
    const saved = q.data.can_act ? draft.read() : null;
    if (saved) {
      setValues({ ...q.data.values, ...saved.values });
      setComment(saved.comment);
      setRestored(true);
    } else setValues(q.data.values);
    qc.invalidateQueries({ queryKey: ["inbox-counts"] });
  }, [q.data, qc, draft]);

  // ذخیره‌ی خودکار پیش‌نویس با کمی تأخیر
  React.useEffect(() => {
    if (!q.data?.can_act || !loaded.current) return;
    const h = setTimeout(() => draft.write({ values, comment }), 600);
    return () => clearTimeout(h);
  }, [values, comment, q.data?.can_act, draft]);

  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.error || !q.data) return <PageError error={q.error} onRetry={() => q.refetch()} back={{ to: "/inbox", label: "کارتابل" }} />;
  const t = q.data;

  const submit = async (outcome = "") => {
    setBusy(outcome || "submit");
    setErrors({});
    const r = await run(() => post(`/workflow/inbox/${id}/complete/`, { data: values, outcome, comment }), "کار انجام و ارسال شد.");
    setBusy(null);
    if (r.ok) {
      draft.clear();
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-counts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/inbox");
    } else setErrors(r.fields ?? {});
  };

  const outcomes = t.outcomes.length ? t.outcomes : [{ code: "", title: "ثبت و ارسال", style: "primary" as const }];

  return (
    <>
      <PageHeader title={t.name} docTitle={`${t.name} · ${t.tracking_code}`}
        crumbs={[{ label: "کارتابل", to: "/inbox" }, { label: t.name }]}
        description={<>{t.instance_title} · شماره‌ی پیگیری <bdi className="tabular-nums">{fa(t.tracking_code)}</bdi></>}
        actions={<Link to={`/requests/${t.instance_id}`} className="inline-flex h-10 items-center gap-2 rounded-control border-line border-input px-4 text-sm font-medium hover:bg-accent"><FileSearch className="size-4" aria-hidden /> پرونده و سوابق</Link>} />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {t.overdue && t.can_act && <Alert variant="warning" title="مهلت انجام این کار گذشته است">مهلت: {fa(t.due_at ?? "")}</Alert>}
          {restored && (
            <Alert title="پیش‌نویس قبلی شما بازیابی شد">
              <span className="flex flex-wrap items-center gap-3">
                تغییراتی که قبلاً وارد کرده بودید دوباره در فرم قرار گرفت.
                <Button size="sm" variant="ghost" onClick={() => { draft.clear(); setValues(t.values); setComment(""); setRestored(false); }}>شروع دوباره</Button>
              </span>
            </Alert>
          )}
          {t.documentation && <Alert title="راهنمای این مرحله">{t.documentation}</Alert>}
          {!t.can_act && <Alert>این کار انجام شده است و فقط قابل مشاهده است.</Alert>}
          <Panel title={t.can_act ? "اطلاعات این مرحله" : "اطلاعات ثبت‌شده"}>
            {t.schema.sections.length ? (
              <FormRenderer schema={t.schema} values={values} onChange={setValues} errors={errors} access={t.access}
                defaultMode="read" readOnly={!t.can_act} />
            ) : <p className="text-muted-foreground">این فرایند فرم ندارد.</p>}
          </Panel>
          {t.can_act && (
            <Panel title="اقدام">
              <FormField label="یادداشت (اختیاری)" htmlFor="comment" hint="در سوابق پرونده ثبت می‌شود و همه‌ی مشارکت‌کنندگان آن را می‌بینند.">
                <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} autoResize />
              </FormField>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {outcomes.map((o) => (
                  <SubmitButton key={o.code} loading={busy === (o.code || "submit")} disabled={!!busy} loadingText="در حال ارسال…"
                    variant={o.style === "danger" ? "destructive" : o.style === "primary" ? "default" : "outline"} onClick={() => submit(o.code)}>
                    {o.title}{o.style === "primary" && <ArrowLeft className="size-4" aria-hidden />}
                  </SubmitButton>
                ))}
                <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
                <Button variant="ghost" onClick={() => setReferOpen(true)} disabled={!!busy}><Forward className="size-4" aria-hidden /> ارجاع به دیگری</Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">تغییرات شما به‌طور خودکار در همین مرورگر به‌عنوان پیش‌نویس نگه داشته می‌شود.</p>
            </Panel>
          )}
        </div>
        <Panel title="مشخصات درخواست" as="div">
          <KeyValue columns={1} items={[
            { label: "درخواست‌دهنده", value: t.initiator_name },
            { label: "نوع فرایند", value: t.process_title },
            { label: "تاریخ دریافت", value: <span className="tabular-nums">{fa(t.created_at)}</span> },
            { label: "مهلت انجام", value: t.due_at ? <span className="flex flex-wrap items-center gap-2 tabular-nums">{fa(t.due_at)} {t.overdue && <StatusBadge tone="destructive" label="دیرکرد" />}</span> : "بدون مهلت" },
          ]} />
        </Panel>
      </div>
      <ReferDialog open={referOpen} onOpenChange={setReferOpen} itemId={id!} onDone={() => { draft.clear(); qc.invalidateQueries({ queryKey: ["inbox"] }); navigate("/inbox"); }} />
    </>
  );
}

function ReferDialog({ open, onOpenChange, itemId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; itemId: string; onDone: () => void }) {
  const { user } = useAuth();
  const users = useUsersBrief(open);
  const run = useApiAction();
  const [target, setTarget] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    setBusy(true);
    const r = await run(() => post(`/workflow/inbox/${itemId}/refer/`, { user_id: Number(target), note }), "کار ارجاع شد.");
    setBusy(false);
    if (r.ok) { onOpenChange(false); onDone(); }
  };
  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} dirty={!!(target || note)} title="ارجاع کار"
      description="کار از کارتابل شما خارج و به کارتابل فرد انتخاب‌شده منتقل می‌شود."
      footer={<><SubmitButton onClick={send} disabled={!target} loading={busy}>ارجاع</SubmitButton><Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button></>}>
      <div className="space-y-4">
        <FormField label="ارجاع به" htmlFor="refer-to" required>
          <Select id="refer-to" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="انتخاب کاربر"
            options={(users.data ?? []).filter((u) => u.id !== user?.id).map((u) => ({ value: String(u.id), label: u.full_name }))} />
        </FormField>
        <FormField label="توضیح ارجاع" htmlFor="refer-note" hint="به فرد گیرنده بگویید چه انتظاری دارید.">
          <Textarea id="refer-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </GuardedDialog>
  );
}
