import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileSearch, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { get, post } from "@/app/api";
import { useAuth } from "@/app/auth";
import { ErrorBlock, KeyValue, LoadingBlock, PageHeader, Panel, useApiAction } from "@/app/ui";
import { FormRenderer } from "@/core/forms/FormRenderer";
import { useUsersBrief } from "@/core/forms/useFormRefs";
import type { Values } from "@/core/forms/types";
import { fa } from "@/lib/utils";
import type { TaskDetail } from "./types";

export default function TaskPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["task", id], queryFn: () => get<TaskDetail>(`/workflow/inbox/${id}/`) });
  const [values, setValues] = React.useState<Values>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [referOpen, setReferOpen] = React.useState(false);

  React.useEffect(() => {
    if (q.data) { setValues(q.data.values); qc.invalidateQueries({ queryKey: ["inbox-counts"] }); }
  }, [q.data, qc]);

  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} />;
  const t = q.data;

  const submit = async (outcome = "") => {
    setBusy(outcome || "submit");
    setErrors({});
    const r = await run(() => post(`/workflow/inbox/${id}/complete/`, { data: values, outcome, comment }), "کار انجام و ارسال شد.");
    setBusy(null);
    if (r.ok) {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-counts"] });
      navigate("/inbox");
    } else setErrors(r.fields ?? {});
  };

  const outcomes = t.outcomes.length ? t.outcomes : [{ code: "", title: "ثبت و ارسال", style: "primary" as const }];

  return (
    <>
      <PageHeader title={t.name} crumbs={[{ label: "کارتابل", to: "/inbox" }, { label: t.process_title }]}
        description={<>{t.instance_title} · شماره‌ی پیگیری {fa(t.tracking_code)}</>}
        actions={<Button variant="outline" onClick={() => navigate(`/requests/${t.instance_id}`)}><FileSearch className="size-4" /> پرونده و سوابق</Button>} />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {t.overdue && t.can_act && <Alert variant="warning" title="مهلت انجام این کار گذشته است">مهلت: {fa(t.due_at ?? "")}</Alert>}
          {t.documentation && <Alert>{t.documentation}</Alert>}
          {!t.can_act && <Alert>این کار انجام شده است و فقط قابل مشاهده است.</Alert>}
          <Panel title={t.can_act ? "اطلاعات این مرحله" : "اطلاعات ثبت‌شده"}>
            {t.schema.sections.length ? (
              <FormRenderer schema={t.schema} values={values} onChange={setValues} errors={errors} access={t.access}
                defaultMode="read" readOnly={!t.can_act} />
            ) : <p className="text-sm text-muted-foreground">این فرایند فرم ندارد.</p>}
          </Panel>
          {t.can_act && (
            <Panel>
              <FormField label="یادداشت (اختیاری)" htmlFor="comment" hint="این یادداشت در سوابق پرونده ثبت می‌شود.">
                <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} autoResize />
              </FormField>
              <div className="mt-5 flex flex-wrap gap-2">
                {outcomes.map((o) => (
                  <Button key={o.code} variant={o.style === "danger" ? "destructive" : o.style === "primary" ? "default" : "outline"}
                    disabled={!!busy} onClick={() => submit(o.code)}>
                    {busy === (o.code || "submit") ? "در حال ارسال…" : o.title}
                    {o.style === "primary" && busy !== (o.code || "submit") && <ArrowLeft className="size-4" />}
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => setReferOpen(true)} disabled={!!busy}><Forward className="size-4" /> ارجاع به دیگری</Button>
              </div>
            </Panel>
          )}
        </div>
        <Panel title="مشخصات درخواست">
          <KeyValue items={[
            { label: "درخواست‌دهنده", value: t.initiator_name },
            { label: "تاریخ دریافت", value: fa(t.created_at) },
            { label: "مهلت انجام", value: t.due_at ? <span className="flex items-center gap-2">{fa(t.due_at)} {t.overdue && <Badge variant="destructive">دیرکرد</Badge>}</span> : "—" },
            { label: "نوع فرایند", value: t.process_title },
          ]} />
        </Panel>
      </div>
      <ReferDialog open={referOpen} onOpenChange={setReferOpen} itemId={id!} onDone={() => { qc.invalidateQueries({ queryKey: ["inbox"] }); navigate("/inbox"); }} />
    </>
  );
}

function ReferDialog({ open, onOpenChange, itemId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; itemId: string; onDone: () => void }) {
  const { user } = useAuth();
  const users = useUsersBrief(open);
  const run = useApiAction();
  const [target, setTarget] = React.useState("");
  const [note, setNote] = React.useState("");
  const send = async () => {
    const r = await run(() => post(`/workflow/inbox/${itemId}/refer/`, { user_id: Number(target), note }), "کار ارجاع شد.");
    if (r.ok) { onOpenChange(false); onDone(); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="ارجاع کار" description="کار از کارتابل شما خارج و به کارتابل فرد انتخاب‌شده منتقل می‌شود."
      footer={<><Button onClick={send} disabled={!target}>ارجاع</Button><Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button></>}>
      <div className="space-y-4">
        <FormField label="ارجاع به" htmlFor="refer-to" required>
          <Select id="refer-to" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="انتخاب کاربر"
            options={(users.data ?? []).filter((u) => u.id !== user?.id).map((u) => ({ value: String(u.id), label: u.full_name }))} />
        </FormField>
        <FormField label="توضیح ارجاع" htmlFor="refer-note">
          <Textarea id="refer-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Dialog>
  );
}
