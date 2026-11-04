import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserRoundCheck } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/ui/password-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { api, del, get, post, tokenStore } from "@/app/api";
import { useAuth, type Me } from "@/app/auth";
import { ErrorSummary, GuardedDialog, JalaliDateInput, KeyValue, PageHeader, Panel, StatusBadge, SubmitButton, useApiAction } from "@/app/ui";
import { useUsersBrief } from "@/core/forms/useFormRefs";
import { fa } from "@/lib/utils";

type Delegation = { id: number; user: number; user_name: string; substitute: number; substitute_name: string; start_date: string; end_date: string; note: string; is_current: boolean };

export default function ProfilePage() {
  const { user, setTheme } = useAuth();
  const qc = useQueryClient();
  const run = useApiAction();
  if (!user) return null;
  const pref = async (body: Partial<Me>) => {
    const r = await run(() => api<Me>("/auth/me/", { method: "PATCH", body }), "ترجیح اعلان ذخیره شد.");
    if (r.ok) qc.setQueryData(["me"], r.data);
  };
  return (
    <>
      <PageHeader title="حساب کاربری" description="مشخصات، ترجیحات، رمز عبور و جانشین" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="مشخصات و ترجیحات">
          <KeyValue items={[
            { label: "نام", value: user.full_name }, { label: "نام کاربری", value: user.username, ltr: true },
            { label: "سمت", value: user.positions.map((p) => `${p.title} (${p.unit})`).join("، ") },
            { label: "نقش‌ها", value: user.role_titles.join("، ") },
          ]} />
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <FormField label="تم نمایش">
              <SegmentedControl value={user.theme} onChange={(v) => setTheme(v as Me["theme"])} aria-label="تم نمایش"
                options={[{ value: "light", label: "روشن" }, { value: "dark", label: "تیره" }, { value: "system", label: "مطابق سیستم" }]} />
            </FormField>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium">دریافت اعلان کارهای جدید و دیرکرد</legend>
              <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={user.notify_sms} onCheckedChange={(v) => pref({ notify_sms: v })} aria-label="با پیامک" /> با پیامک</label>
              <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={user.notify_email} onCheckedChange={(v) => pref({ notify_email: v })} aria-label="با ایمیل" /> با ایمیل</label>
            </fieldset>
          </div>
        </Panel>
        <ChangePassword />
        <Delegations meId={user.id} />
      </div>
    </>
  );
}

function ChangePassword() {
  const run = useApiAction();
  const [f, setF] = React.useState({ old_password: "", new_password: "", repeat: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.new_password !== f.repeat) { setErrors({ repeat: "تکرار رمز با رمز جدید یکسان نیست." }); return; }
    setBusy(true);
    const r = await run(() => post<{ token: string }>("/auth/change-password/", f), "رمز عبور تغییر کرد.");
    setBusy(false);
    if (r.ok && r.data) { tokenStore.set(r.data.token); setF({ old_password: "", new_password: "", repeat: "" }); setErrors({}); } else setErrors(r.fields ?? {});
  };
  return (
    <Panel title="تغییر رمز عبور" as="div">
      <form id="password" onSubmit={change} className="space-y-4" noValidate>
        <ErrorSummary errors={errors} labels={{ old_password: "رمز فعلی", new_password: "رمز جدید", repeat: "تکرار رمز" }} />
        <FormField label="رمز فعلی" htmlFor="f-old_password" required error={errors.old_password}>
          <PasswordInput id="f-old_password" autoComplete="current-password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} />
        </FormField>
        <FormField label="رمز جدید" htmlFor="f-new_password" required error={errors.new_password} hint="حداقل ۸ نویسه؛ ترکیب حرف و عدد امن‌تر است.">
          <PasswordInput id="f-new_password" strength autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} />
        </FormField>
        <FormField label="تکرار رمز جدید" htmlFor="f-repeat" required error={errors.repeat}>
          <PasswordInput id="f-repeat" autoComplete="new-password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} />
        </FormField>
        <SubmitButton type="submit" loading={busy} disabled={!f.old_password || !f.new_password || !f.repeat}>تغییر رمز</SubmitButton>
      </form>
    </Panel>
  );
}

function Delegations({ meId }: { meId: number }) {
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["delegations"], queryFn: () => get<Delegation[]>("/delegations/") });
  const users = useUsersBrief();
  const empty = { substitute: "", start_date: "", end_date: "", note: "" };
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState(empty);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [remove, setRemove] = React.useState<Delegation | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => post("/delegations/", { ...d, substitute: Number(d.substitute) || null }), "جانشین تعیین شد.");
    setBusy(false);
    if (r.ok) { setOpen(false); setD(empty); setErrors({}); qc.invalidateQueries({ queryKey: ["delegations"] }); }
    else setErrors(r.fields ?? {});
  };
  return (
    <Panel title="جانشین در زمان غیبت" className="lg:col-span-2" flush
      description="در بازه‌ی تعیین‌شده، کارهای شما به کارتابل جانشین هم می‌رود و در سوابق «به نیابت از شما» ثبت می‌شود."
      actions={<Button variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> تعیین جانشین</Button>}>
      {!q.data?.length ? <EmptyState icon={UserRoundCheck} title="جانشینی تعریف نشده است" description="پیش از مرخصی یا مأموریت، یک همکار را جانشین خود کنید." /> : (
        <ul className="divide-y divide-border">
          {q.data.map((x) => (
            <li key={x.id} className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {x.user === meId ? <>جانشین من: {x.substitute_name}</> : <>من جانشین {x.user_name} هستم</>}
                  {x.is_current ? <StatusBadge tone="success" label="فعال" /> : <StatusBadge tone="neutral" label="غیرفعال" />}
                </div>
                <div className="text-sm text-muted-foreground tabular-nums">از {fa(x.start_date)} تا {fa(x.end_date)}{x.note ? ` · ${x.note}` : ""}</div>
              </div>
              {x.user === meId && (
                <Button variant="ghost" size="icon" className="text-destructive" aria-label={`حذف جانشینی ${x.substitute_name}`} onClick={() => setRemove(x)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <GuardedDialog open={open} onOpenChange={setOpen} dirty={JSON.stringify(d) !== JSON.stringify(empty)} title="تعیین جانشین"
        footer={<><SubmitButton type="submit" form="delegation-form" loading={busy}>ذخیره</SubmitButton><Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button></>}>
        <form id="delegation-form" onSubmit={save} className="space-y-4" noValidate>
          <ErrorSummary errors={errors} labels={{ substitute: "جانشین", start_date: "از تاریخ", end_date: "تا تاریخ" }} />
          <FormField label="جانشین" htmlFor="f-substitute" required error={errors.substitute}>
            <Select id="f-substitute" value={d.substitute} placeholder="انتخاب همکار" onChange={(e) => setD({ ...d, substitute: e.target.value })}
              options={(users.data ?? []).filter((u) => u.id !== meId).map((u) => ({ value: String(u.id), label: u.full_name }))} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="از تاریخ" required error={errors.start_date}><JalaliDateInput id="f-start_date" value={d.start_date} onChange={(v) => setD({ ...d, start_date: v })} /></FormField>
            <FormField label="تا تاریخ" required error={errors.end_date}><JalaliDateInput id="f-end_date" value={d.end_date} onChange={(v) => setD({ ...d, end_date: v })} /></FormField>
          </div>
          <FormField label="توضیح" htmlFor="f-note" hint="مثلاً «مرخصی استحقاقی»"><Textarea id="f-note" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></FormField>
        </form>
      </GuardedDialog>
      <AlertDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} destructive title="حذف جانشینی" confirmText="حذف"
        description={`از این پس کارهای شما به کارتابل ${remove?.substitute_name ?? ""} نمی‌رود.`}
        onConfirm={async () => { const x = remove!; setRemove(null); await run(() => del(`/delegations/${x.id}/`), "جانشینی حذف شد."); qc.invalidateQueries({ queryKey: ["delegations"] }); }} />
    </Panel>
  );
}
