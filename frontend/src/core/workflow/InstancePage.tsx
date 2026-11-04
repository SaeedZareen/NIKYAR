import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, Printer, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form";
import { get, post } from "@/app/api";
import { ErrorBlock, KeyValue, LoadingBlock, PageHeader, Panel, StatusBadge, useApiAction } from "@/app/ui";
import { FormRenderer } from "@/core/forms/FormRenderer";
import { cn, fa } from "@/lib/utils";
import { DiagramViewer } from "./DiagramViewer";
import type { InstanceDetail } from "./types";

const DOT: Record<string, string> = {
  task_done: "bg-success", completed: "bg-success", referred: "bg-warning", warning: "bg-warning",
  cancelled: "bg-destructive", system: "bg-brand", comment: "bg-muted-foreground",
};

export default function InstancePage() {
  const { id } = useParams();
  const run = useApiAction();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["instance", id], queryFn: () => get<InstanceDetail>(`/workflow/instances/${id}/`) });
  const [note, setNote] = React.useState("");
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} />;
  const i = q.data;

  const addNote = async () => {
    const r = await run(() => post(`/workflow/instances/${id}/comment/`, { text: note }), "یادداشت ثبت شد.");
    if (r.ok) { setNote(""); q.refetch(); }
  };
  const cancel = async () => {
    const r = await run(() => post(`/workflow/instances/${id}/cancel/`, { reason }), "درخواست لغو شد.");
    if (r.ok) { setCancelOpen(false); q.refetch(); }
  };

  return (
    <>
      <PageHeader title={i.title} crumbs={[{ label: "پیگیری درخواست‌ها", to: "/requests" }, { label: i.process_title }]}
        description={<span className="flex items-center gap-2">شماره‌ی پیگیری {fa(i.tracking_code)} <StatusBadge status={i.status} label={i.status_display} /></span>}
        actions={<>
          <Button variant="outline" onClick={() => navigate(`/requests/${id}/print`)}><Printer className="size-4" /> نسخه‌ی چاپی</Button>
          {i.can_cancel && <Button variant="outline" onClick={() => setCancelOpen(true)}><XCircle className="size-4" /> لغو درخواست</Button>}
        </>} />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel title="نقشه‌ی فرایند" className="lg:col-span-2" bodyClassName="p-2"
          actions={<span className="flex gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warning" />مرحله‌ی جاری</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-success" />انجام‌شده</span></span>}>
          <DiagramViewer xml={i.xml} active={i.active_elements} done={i.completed_elements} />
        </Panel>
        <Panel title="مشخصات">
          <KeyValue items={[
            { label: "درخواست‌دهنده", value: i.initiator_name },
            { label: "تاریخ ثبت", value: fa(i.started_at) },
            { label: "تاریخ خاتمه", value: i.ended_at ? fa(i.ended_at) : "—" },
            { label: "نسخه‌ی فرایند", value: fa(i.version) },
          ]} />
        </Panel>
      </div>
      <Tabs defaultValue="data" variant="underline" className="mt-6">
        <TabsList>
          <TabsTrigger value="data">اطلاعات پرونده</TabsTrigger>
          <TabsTrigger value="history">سوابق</TabsTrigger>
          <TabsTrigger value="steps">مراحل و کارپذیران</TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <Panel>{i.schema.sections.length ? <FormRenderer schema={i.schema} values={i.values} readOnly /> : <p className="text-sm text-muted-foreground">این فرایند فرم ندارد.</p>}</Panel>
        </TabsContent>
        <TabsContent value="history">
          <Panel>
            <ol className="space-y-4">
              {i.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", DOT[e.kind] ?? "bg-primary")} />
                  <div>
                    <div className="text-xs text-muted-foreground">{fa(e.at)} · {e.kind_display}</div>
                    <div className="text-sm">{e.message}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="افزودن یادداشت به پرونده"
                onKeyDown={(e) => e.key === "Enter" && note.trim() && addNote()} />
              <Button variant="outline" onClick={addNote} disabled={!note.trim()}><MessageSquarePlus className="size-4" /> ثبت</Button>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="steps">
          <Panel bodyClassName="p-0">
            <div className="overflow-x-auto">
              <Table className="whitespace-nowrap">
                <TableHeader><TableRow><TableHead>مرحله</TableHead><TableHead>کارپذیر</TableHead><TableHead>دریافت</TableHead><TableHead>انجام‌دهنده</TableHead><TableHead>انجام</TableHead><TableHead>وضعیت</TableHead></TableRow></TableHeader>
                <TableBody>
                  {i.work_items.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell>{w.candidates.join("، ")}</TableCell>
                      <TableCell>{fa(w.created_at)}</TableCell>
                      <TableCell>{w.completed_by_name || "—"}</TableCell>
                      <TableCell>{w.completed_at ? fa(w.completed_at) : "—"}</TableCell>
                      <TableCell><StatusBadge status={w.status} label={w.status_display} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen} role="alertdialog" title="لغو درخواست"
        description="با لغو درخواست، همه‌ی کارهای باز آن از کارتابل‌ها حذف می‌شود. این کار برگشت‌پذیر نیست."
        footer={<><Button variant="destructive" onClick={cancel}>لغو درخواست</Button><Button variant="ghost" onClick={() => setCancelOpen(false)}>انصراف</Button></>}>
        <FormField label="علت لغو" htmlFor="reason"><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
      </Dialog>
    </>
  );
}
