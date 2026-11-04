// نسخه‌ی رسمی قابل چاپ پرونده با سربرگ سازمان (چاپ یا ذخیره به PDF از مرورگر)
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { get } from "@/app/api";
import { applyTheme, useAuth } from "@/app/auth";
import { ErrorBlock, LoadingBlock, useDocumentTitle } from "@/app/ui";
import { FormRenderer } from "@/core/forms/FormRenderer";
import { todayJ } from "@/core/workflow/printUtils";
import { fa } from "@/lib/utils";
import type { InstanceDetail } from "./types";

type Org = { org_name: string; org_short_name: string; org_logo: number[] | null; org_address?: string; org_phone?: string; org_national_id?: string };

export default function PrintPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["instance", id], queryFn: () => get<InstanceDetail>(`/workflow/instances/${id}/`) });
  const org = useQuery({ queryKey: ["public-settings"], queryFn: () => get<Org>("/settings/public/") });
  useDocumentTitle(q.data ? `نسخه‌ی چاپی ${q.data.tracking_code}` : "نسخه‌ی چاپی");
  React.useEffect(() => {
    applyTheme("light");  // چاپ همیشه روی زمینه‌ی روشن
    return () => applyTheme(user?.theme ?? "light");
  }, [user?.theme]);

  if (q.isLoading || org.isLoading) return <div className="p-8"><LoadingBlock rows={10} /></div>;
  if (q.error || !q.data) return <div className="p-8"><ErrorBlock error={q.error} /></div>;
  const i = q.data;
  const o = org.data;
  const logo = o?.org_logo?.[0];
  const signed = i.work_items.filter((w) => w.status === "done");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 p-4 print:hidden">
        <Link to={`/requests/${id}`} className="flex min-h-10 items-center gap-2 rounded-control text-sm text-brand hover:underline"><ArrowRight className="size-4" aria-hidden /> بازگشت به پرونده</Link>
        <Button onClick={() => window.print()}><Printer className="size-4" aria-hidden /> چاپ یا ذخیره‌ی PDF</Button>
      </div>
      <main id="main"><article className="mx-auto max-w-4xl border-line border-border bg-card p-8 print:max-w-none print:border-0 print:p-0">
        <header className="mb-6 grid grid-cols-3 items-center gap-4 border-b border-border pb-4">
          <div className="text-sm leading-7">
            <div>شماره: {fa(i.tracking_code)}</div>
            <div>تاریخ: {fa(i.started_at.split(" ")[0])}</div>
            <div>پیوست: {i.values && Object.values(i.values).some((v) => Array.isArray(v) && v.length && typeof v[0] === "number") ? "دارد" : "ندارد"}</div>
          </div>
          <div className="text-center">
            {logo && <img src={`/api/files/${logo}/`} alt={`لوگوی ${o?.org_name}`} className="mx-auto mb-2 aspect-square h-16 w-16 object-contain" />}
            <div className="text-lg font-bold leading-tight">{o?.org_name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{i.process_title}</div>
          </div>
          <div />
        </header>
        <h1 className="mb-6 text-center text-xl font-bold">{i.title}</h1>
        <section className="mb-8">
          <FormRenderer schema={i.schema} values={i.values} readOnly />
        </section>
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold">گردش و تأییدها</h2>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">گردش و تأییدهای درخواست</caption>
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="border border-border p-2 text-start">مرحله</th><th scope="col" className="border border-border p-2 text-start">اقدام‌کننده</th>
                <th scope="col" className="border border-border p-2 text-start">تاریخ</th><th scope="col" className="border border-border p-2 text-start">امضا</th>
              </tr>
            </thead>
            <tbody>
              {!signed.length && (
                <tr>
                  <td className="border border-border p-2">ثبت درخواست</td><td className="border border-border p-2">{i.initiator_name}</td>
                  <td className="border border-border p-2">{fa(i.started_at)}</td><td className="h-12 w-32 border border-border p-2" />
                </tr>
              )}
              {signed.map((w) => (
                <tr key={w.id}>
                  <td className="border border-border p-2">{w.name}</td><td className="border border-border p-2">{w.completed_by_name}</td>
                  <td className="border border-border p-2">{fa(w.completed_at ?? "")}</td><td className="h-12 w-32 border border-border p-2" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <footer className="border-t border-border pt-3 text-xs leading-6 text-muted-foreground">
          {[o?.org_address, o?.org_phone && `تلفن: ${fa(o.org_phone)}`, o?.org_national_id && `شناسه‌ی ملی: ${fa(o.org_national_id)}`].filter(Boolean).join(" · ")}
          <div>وضعیت پرونده هنگام چاپ: {i.status_display} · تاریخ چاپ: {fa(todayJ())}</div>
        </footer>
      </article></main>
    </div>
  );
}
