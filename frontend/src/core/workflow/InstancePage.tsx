import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form";
import { get, post } from "@/app/api";
import { PageError, GuardedDialog, KeyValue, LinkButton, LoadingBlock, PageHeader, Panel, StatusBadge, SubmitButton, useApiAction, useUrlState } from "@/app/ui";
import { ResponsiveList, type Column } from "@/app/list";
import { FormRenderer } from "@/core/forms/FormRenderer";
import { cn, fa } from "@/lib/utils";
import { DiagramViewer } from "./DiagramViewer";
import type { InstanceDetail } from "./types";

const DOT: Record<string, string> = {
  task_done: "bg-success", completed: "bg-success", referred: "bg-warning", warning: "bg-warning",
  cancelled: "bg-destructive", system: "bg-brand", comment: "bg-muted-foreground",
};
type Step = InstanceDetail["work_items"][number];

export default function InstancePage() {
  const { id } = useParams();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["instance", id], queryFn: () => get<InstanceDetail>(`/workflow/instances/${id}/`) });
  const [tab, setTab] = useUrlState("tab", "data");
  const [note, setNote] = React.useState("");
  const [noteBusy, setNoteBusy] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [cancelBusy, setCancelBusy] = React.useState(false);

  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.error || !q.data) return <PageError error={q.error} onRetry={() => q.refetch()} back={{ to: "/requests", label: "پیگیری درخواست‌ها" }} />;
  const i = q.data;

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setNoteBusy(true);
    const r = await run(() => post(`/workflow/instances/${id}/comment/`, { text: note }), "یادداشت ثبت شد.");
    setNoteBusy(false);
    if (r.ok) { setNote(""); q.refetch(); }
  };
  const cancel = async () => {
    setCancelBusy(true);
    const r = await run(() => post(`/workflow/instances/${id}/cancel/`, { reason }), "درخواست لغو شد.");
    setCancelBusy(false);
    if (r.ok) { setCancelOpen(false); q.refetch(); }
  };
  const stepColumns: Column<Step>[] = [
    { key: "name", header: "مرحله", primary: true, cell: (w) => w.name },
    { key: "candidates", header: "کارپذیر", cell: (w) => w.candidates.join("، ") },
    { key: "created", header: "دریافت", cell: (w) => <span className="tabular-nums">{fa(w.created_at)}</span> },
    { key: "by", header: "انجام‌دهنده", cell: (w) => w.completed_by_name || "—" },
    { key: "done", header: "انجام", cell: (w) => <span className="tabular-nums">{w.completed_at ? fa(w.completed_at) : "—"}</span> },
    { key: "status", header: "وضعیت", cell: (w) => <StatusBadge status={w.status} label={w.status_display} /> },
  ];

  return (
    <>
      <PageHeader title={i.title} docTitle={`${i.title} · ${i.tracking_code}`}
        crumbs={[{ label: "پیگیری درخواست‌ها", to: "/requests" }, { label: i.title }]}
        description={<span className="flex flex-wrap items-center gap-2">شماره‌ی پیگیری <bdi className="tabular-nums">{fa(i.tracking_code)}</bdi> <StatusBadge status={i.status} label={i.status_display} /></span>}
        actions={<>
          <LinkButton to={`/requests/${id}/print`} variant="outline"><Printer className="size-4" aria-hidden /> نسخه‌ی چاپی</LinkButton>
          {i.can_cancel && <Button variant="ghost" className="text-destructive" onClick={() => setCancelOpen(true)}><XCircle className="size-4" aria-hidden /> لغو درخواست</Button>}
        </>} />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel title="نقشه‌ی فرایند" className="lg:col-span-2" bodyClassName="p-2"
          actions={<ul className="flex gap-4 text-sm text-muted-foreground" aria-label="راهنمای رنگ‌ها">
            <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full bg-warning" />مرحله‌ی جاری</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full bg-success" />انجام‌شده</li>
          </ul>}>
          <DiagramViewer xml={i.xml} active={i.active_elements} done={i.completed_elements} />
          <p className="sr-only">مرحله‌ی جاری: {i.work_items.filter((w) => w.status === "open").map((w) => w.name).join("، ") || "ندارد"}</p>
        </Panel>
        <Panel title="مشخصات" as="div">
          <KeyValue columns={1} items={[
            { label: "نوع فرایند", value: i.process_title },
            { label: "درخواست‌دهنده", value: i.initiator_name },
            { label: "تاریخ ثبت", value: <span className="tabular-nums">{fa(i.started_at)}</span> },
            { label: "تاریخ خاتمه", value: i.ended_at ? <span className="tabular-nums">{fa(i.ended_at)}</span> : "در جریان" },
            { label: "نسخه‌ی فرایند", value: fa(i.version) },
          ]} />
        </Panel>
      </div>
      <Tabs value={tab} defaultValue="data" onValueChange={setTab} variant="underline" className="mt-8">
        <TabsList>
          <TabsTrigger value="data">اطلاعات پرونده</TabsTrigger>
          <TabsTrigger value="history">سوابق ({fa(i.events.length)})</TabsTrigger>
          <TabsTrigger value="steps">مراحل و کارپذیران</TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <Panel>{i.schema.sections.length ? <FormRenderer schema={i.schema} values={i.values} readOnly /> : <p className="text-muted-foreground">این فرایند فرم ندارد.</p>}</Panel>
        </TabsContent>
        <TabsContent value="history">
          <Panel>
            <ol className="space-y-5" aria-label="سوابق پرونده">
              {i.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span aria-hidden className={cn("mt-2 size-2.5 shrink-0 rounded-full", DOT[e.kind] ?? "bg-primary")} />
                  <div>
                    <div className="text-sm text-muted-foreground"><time className="tabular-nums">{fa(e.at)}</time> · {e.kind_display}</div>
                    <div>{e.message}</div>
                  </div>
                </li>
              ))}
            </ol>
            <form onSubmit={addNote} className="mt-8 flex flex-wrap items-end gap-3 border-t border-border pt-6">
              <FormField label="افزودن یادداشت به پرونده" htmlFor="note" className="min-w-60 flex-1">
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </FormField>
              <SubmitButton type="submit" variant="outline" loading={noteBusy} disabled={!note.trim()}><MessageSquarePlus className="size-4" aria-hidden /> ثبت یادداشت</SubmitButton>
            </form>
          </Panel>
        </TabsContent>
        <TabsContent value="steps">
          <Panel flush>
            <ResponsiveList rows={i.work_items} columns={stepColumns} rowKey={(w) => w.id} caption="مراحل و کارپذیران" empty={{ title: "هنوز مرحله‌ای ایجاد نشده است" }} />
          </Panel>
        </TabsContent>
      </Tabs>
      <GuardedDialog open={cancelOpen} onOpenChange={setCancelOpen} dirty={!!reason} role="alertdialog" title="لغو درخواست"
        description="با لغو درخواست، همه‌ی کارهای باز آن از کارتابل‌ها حذف می‌شود. این کار برگشت‌پذیر نیست."
        footer={<><SubmitButton variant="destructive" onClick={cancel} loading={cancelBusy}>لغو درخواست</SubmitButton><Button variant="ghost" onClick={() => setCancelOpen(false)}>بازگشت</Button></>}>
        <FormField label="علت لغو" htmlFor="reason" hint="در سوابق پرونده ثبت می‌شود."><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
      </GuardedDialog>
    </>
  );
}
