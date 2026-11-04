import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form";
import { get, post, put } from "@/app/api";
import { LoadingBlock, PageHeader, Panel, useApiAction } from "@/app/ui";
import { FormRenderer } from "@/core/forms/FormRenderer";
import type { FormSchema, Values } from "@/core/forms/types";
import { fa } from "@/lib/utils";

type Log = { id: number; channel: string; recipient: string; title: string; ok: boolean; error: string; at: string };

export default function SettingsPage() {
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => get<{ schema: FormSchema; values: Values }>("/settings/") });
  const [values, setValues] = React.useState<Values>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => { if (q.data) setValues(q.data.values); }, [q.data]);
  if (q.isLoading || !q.data) return <LoadingBlock rows={10} />;

  const save = async () => {
    const r = await run(() => put<{ values: Values }>("/settings/", { values }), "تنظیمات ذخیره شد.");
    if (r.ok) { setErrors({}); qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["public-settings"] }); }
    else setErrors(r.fields ?? {});
  };

  return (
    <>
      <PageHeader title="تنظیمات سازمان" description="مشخصات سازمان، پیامک، ایمیل و مهلت‌های کارتابل"
        actions={<Button onClick={save}><Save className="size-4" /> ذخیره‌ی تنظیمات</Button>} />
      <div className="space-y-6">
        {q.data.schema.sections.map((s) => (
          <Panel key={s.id}>
            <FormRenderer schema={{ sections: [s] }} values={values} onChange={setValues} errors={errors} />
          </Panel>
        ))}
        <ChannelTest />
      </div>
    </>
  );
}

function ChannelTest() {
  const run = useApiAction();
  const [channel, setChannel] = React.useState("sms");
  const [to, setTo] = React.useState("");
  const log = useQuery({ queryKey: ["delivery-log"], queryFn: () => get<Log[]>("/notifications/log/") });
  const send = async () => { await run(() => post("/notifications/test/", { channel, to }), "پیام آزمایشی ارسال شد."); log.refetch(); };
  return (
    <Panel title="آزمایش ارسال" description="ابتدا تنظیمات را ذخیره کنید، سپس یک پیام آزمایشی بفرستید.">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <SegmentedControl value={channel} onChange={setChannel} aria-label="کانال" options={[{ value: "sms", label: "پیامک" }, { value: "email", label: "ایمیل" }]} />
        <FormField label={channel === "sms" ? "شماره موبایل گیرنده" : "ایمیل گیرنده"} htmlFor="test-to" className="min-w-60 flex-1">
          <Input id="test-to" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <Button variant="outline" onClick={send} disabled={!to}><Send className="size-4" /> ارسال آزمایشی</Button>
      </div>
      <h3 className="mb-2 text-sm font-semibold">آخرین ارسال‌ها</h3>
      {!log.data?.length ? <EmptyState title="هنوز پیامک یا ایمیلی ارسال نشده است" /> : (
        <Table className="whitespace-nowrap">
          <TableHeader><TableRow><TableHead>زمان</TableHead><TableHead>کانال</TableHead><TableHead>گیرنده</TableHead><TableHead>عنوان</TableHead><TableHead>نتیجه</TableHead></TableRow></TableHeader>
          <TableBody>
            {log.data.slice(0, 15).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{fa(l.at)}</TableCell>
                <TableCell>{l.channel === "sms" ? "پیامک" : "ایمیل"}</TableCell>
                <TableCell dir="ltr" className="text-end">{l.recipient}</TableCell>
                <TableCell>{l.title}</TableCell>
                <TableCell>{l.ok ? <Badge variant="success">موفق</Badge> : <Badge variant="destructive">{l.error || "ناموفق"}</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
