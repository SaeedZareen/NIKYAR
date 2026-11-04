import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserRoundCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { api, del, get, post, tokenStore } from "@/app/api";
import { useAuth, type Me } from "@/app/auth";
import { JalaliDateInput, KeyValue, PageHeader, Panel, useApiAction } from "@/app/ui";
import { useUsersBrief } from "@/core/forms/useFormRefs";
import { fa } from "@/lib/utils";

type Delegation = { id: number; user: number; user_name: string; substitute: number; substitute_name: string; start_date: string; end_date: string; note: string; is_current: boolean };

export default function ProfilePage() {
  const { user, setTheme } = useAuth();
  const qc = useQueryClient();
  const run = useApiAction();
  const [f, setF] = React.useState({ old_password: "", new_password: "", repeat: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  if (!user) return null;
  const change = async () => {
    if (f.new_password !== f.repeat) { setErrors({ repeat: "تکرار رمز با رمز جدید یکسان نیست." }); return; }
    const r = await run(() => post<{ token: string }>("/auth/change-password/", f), "رمز عبور تغییر کرد.");
    if (r.ok && r.data) { tokenStore.set(r.data.token); setF({ old_password: "", new_password: "", repeat: "" }); setErrors({}); } else setErrors(r.fields ?? {});
  };
  const pref = async (body: Partial<Me>) => {
    const r = await run(() => api<Me>("/auth/me/", { method: "PATCH", body }), "ترجیح اعلان ذخیره شد.");
    if (r.ok) qc.setQueryData(["me"], r.data);
  };
  return (
    <>
      <PageHeader title="حساب کاربری" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="مشخصات">
          <KeyValue items={[
            { label: "نام", value: user.full_name }, { label: "نام کاربری", value: user.username, ltr: true },
            { label: "سمت", value: user.positions.map((p) => `${p.title} (${p.unit})`).join("، ") },
            { label: "نقش‌ها", value: user.role_titles.join("، ") },
          ]} />
          <div className="mt-6 space-y-3">
            <FormField label="تم نمایش">
              <SegmentedControl value={user.theme} onChange={(v) => setTheme(v as "paper")} aria-label="تم"
                options={[{ value: "graphite", label: "تیره (گرافیت)" }, { value: "paper", label: "روشن (کاغذ)" }]} />
            </FormField>
            <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={user.notify_sms} onCheckedChange={(v) => pref({ notify_sms: v })} aria-label="اعلان پیامکی" /> دریافت اعلان با پیامک</label>
            <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={user.notify_email} onCheckedChange={(v) => pref({ notify_email: v })} aria-label="اعلان ایمیلی" /> دریافت اعلان با ایمیل</label>
          </div>
        </Panel>
        <Panel title="تغییر رمز عبور">
          <div className="space-y-4">
            <FormField label="رمز فعلی" htmlFor="op" error={errors.old_password}><Input id="op" dir="ltr" type="password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} /></FormField>
            <FormField label="رمز جدید" htmlFor="np" error={errors.new_password} hint="حداقل ۸ نویسه"><Input id="np" dir="ltr" type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></FormField>
            <FormField label="تکرار رمز جدید" htmlFor="rp" error={errors.repeat}><Input id="rp" dir="ltr" type="password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} /></FormField>
            <Button onClick={change} disabled={!f.old_password || !f.new_password}>تغییر رمز</Button>
          </div>
        </Panel>
        <Delegations meId={user.id} />
      </div>
    </>
  );
}

function Delegations({ meId }: { meId: number }) {
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["delegations"], queryFn: () => get<Delegation[]>("/delegations/") });
  const users = useUsersBrief();
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState({ substitute: "", start_date: "", end_date: "", note: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = async () => {
    const r = await run(() => post("/delegations/", { ...d, substitute: Number(d.substitute) }), "جانشین تعیین شد.");
    if (r.ok) { setOpen(false); setD({ substitute: "", start_date: "", end_date: "", note: "" }); qc.invalidateQueries({ queryKey: ["delegations"] }); }
    else setErrors(r.fields ?? {});
  };
  const remove = async (id: number) => { await run(() => del(`/delegations/${id}/`), "جانشینی حذف شد."); qc.invalidateQueries({ queryKey: ["delegations"] }); };
  return (
    <Panel title="جانشین در زمان غیبت" className="lg:col-span-2"
      description="در بازه‌ی تعیین‌شده، کارهای شما به کارتابل جانشین هم می‌رود و در سوابق «به نیابت از شما» ثبت می‌شود."
      actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> تعیین جانشین</Button>} bodyClassName="p-0">
      {!q.data?.length ? <EmptyState icon={UserRoundCheck} title="جانشینی تعریف نشده است" /> : (
        <ul className="divide-y divide-border">
          {q.data.map((x) => (
            <li key={x.id} className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <div className="text-sm font-medium">
                  {x.user === meId ? <>جانشین من: {x.substitute_name}</> : <>من جانشین {x.user_name} هستم</>}
                  {x.is_current && <Badge variant="success" className="ms-2">فعال</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">از {fa(x.start_date)} تا {fa(x.end_date)}{x.note ? ` · ${x.note}` : ""}</div>
              </div>
              {x.user === meId && <Button variant="ghost" size="icon" className="text-destructive" aria-label="حذف جانشینی" onClick={() => remove(x.id)}><Trash2 className="size-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="تعیین جانشین"
        footer={<><Button onClick={save} disabled={!d.substitute || !d.start_date || !d.end_date}>ذخیره</Button><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button></>}>
        <div className="space-y-4">
          <FormField label="جانشین" htmlFor="dl-sub" required error={errors.substitute}>
            <Select id="dl-sub" value={d.substitute} placeholder="انتخاب کاربر" onChange={(e) => setD({ ...d, substitute: e.target.value })}
              options={(users.data ?? []).filter((u) => u.id !== meId).map((u) => ({ value: String(u.id), label: u.full_name }))} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="از تاریخ" required error={errors.start_date}><JalaliDateInput value={d.start_date} onChange={(v) => setD({ ...d, start_date: v })} /></FormField>
            <FormField label="تا تاریخ" required error={errors.end_date}><JalaliDateInput value={d.end_date} onChange={(v) => setD({ ...d, end_date: v })} /></FormField>
          </div>
          <FormField label="توضیح" htmlFor="dl-note"><Textarea id="dl-note" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></FormField>
        </div>
      </Dialog>
    </Panel>
  );
}
