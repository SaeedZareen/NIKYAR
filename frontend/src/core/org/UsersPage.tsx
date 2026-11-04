import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FormField } from "@/components/ui/form";
import { get, patch, post } from "@/app/api";
import { useAuth } from "@/app/auth";
import { ErrorBlock, ErrorSummary, GuardedDialog, PageHeader, Panel, StatusBadge, SubmitButton, useApiAction, useUrlState } from "@/app/ui";
import { ListToolbar, matches, ResponsiveList, type Column } from "@/app/list";
import { fa } from "@/lib/utils";

type User = {
  id: number; username: string; first_name: string; last_name: string; full_name: string; email: string; is_active: boolean;
  is_superuser: boolean; roles: number[]; role_titles: string[]; positions: { title: string; unit: string }[]; mobile: string; last_login: string | null;
};

const LABELS = { first_name: "نام", last_name: "نام خانوادگی", username: "نام کاربری", password: "رمز عبور", mobile: "موبایل", email: "ایمیل", roles: "نقش‌ها" };

export default function UsersPage() {
  const q = useQuery({ queryKey: ["users"], queryFn: () => get<User[]>("/users/") });
  const [term, setTerm] = useUrlState("q");
  const [state, setState] = useUrlState("state", "active");
  const [edit, setEdit] = React.useState<Partial<User> | null>(null);
  const rows = (q.data ?? []).filter((u) => (state === "all" || u.is_active === (state === "active")) && matches(term, u.full_name, u.username, u.mobile));
  const columns: Column<User>[] = [
    { key: "name", header: "نام", primary: true, sortValue: (u) => u.full_name, cell: (u) => <span className="flex flex-wrap items-center gap-2">{u.full_name}{u.is_superuser && <StatusBadge tone="brand" label="مدیر کل" />}</span> },
    { key: "username", header: "نام کاربری", sortValue: (u) => u.username, cell: (u) => <bdi dir="ltr">{u.username}</bdi> },
    { key: "positions", header: "سمت", cell: (u) => u.positions.map((p) => `${p.title} (${p.unit})`).join("، ") || <span className="text-muted-foreground">بدون سمت</span> },
    { key: "roles", header: "نقش‌ها", cell: (u) => u.role_titles.join("، ") || "—", hideOnMobile: true },
    { key: "state", header: "وضعیت", cell: (u) => <StatusBadge tone={u.is_active ? "success" : "neutral"} label={u.is_active ? "فعال" : "غیرفعال"} /> },
  ];
  return (
    <>
      <PageHeader title="کاربران" description="حساب‌های کاربری، نقش‌ها و وضعیت دسترسی"
        actions={<Button onClick={() => setEdit({ is_active: true, roles: [] })}><Plus className="size-4" aria-hidden /> کاربر جدید</Button>} />
      {q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <Panel flush>
          <ListToolbar count={q.data ? rows.length : undefined}>
            <div className="w-full sm:w-72"><SearchInput value={term} onChange={setTerm} placeholder="نام، نام کاربری یا موبایل" aria-label="جست‌وجوی کاربر" size="sm" /></div>
            <SegmentedControl size="sm" value={state} onChange={setState} aria-label="وضعیت"
              options={[{ value: "active", label: "فعال" }, { value: "inactive", label: "غیرفعال" }, { value: "all", label: "همه" }]} />
          </ListToolbar>
          <ResponsiveList rows={rows} columns={columns} rowKey={(u) => u.id} loading={q.isLoading} caption="کاربران"
            rowActions={(u) => <Button size="sm" variant="ghost" onClick={() => setEdit(u)} aria-label={`ویرایش ${u.full_name}`}><Pencil className="size-4" aria-hidden /> ویرایش</Button>}
            empty={{ icon: Users, title: "کاربری پیدا نشد", description: "فیلترها را تغییر دهید." }} />
        </Panel>
      )}
      {edit && <UserDialog item={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function UserDialog({ item, onClose }: { item: Partial<User>; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const run = useApiAction();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => get<{ id: number; title: string }[]>("/roles/") });
  const initial = {
    username: item.username ?? "", first_name: item.first_name ?? "", last_name: item.last_name ?? "", email: item.email ?? "",
    mobile: item.mobile ?? "", password: "", is_active: item.is_active ?? true, is_superuser: item.is_superuser ?? false, roles: item.roles ?? [],
  };
  const [f, setF] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { ...f };
    if (!f.password) delete body.password;
    setBusy(true);
    const r = await run(() => (item.id ? patch(`/users/${item.id}/`, body) : post("/users/", body)), "کاربر ذخیره شد.");
    setBusy(false);
    if (r.ok) { qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["users-brief"] }); onClose(); } else setErrors(r.fields ?? {});
  };
  return (
    <GuardedDialog open onOpenChange={(o) => !o && onClose()} dirty={dirty} title={item.id ? `ویرایش ${item.full_name}` : "کاربر جدید"} className="max-w-2xl"
      footer={<><SubmitButton type="submit" form="user-form" loading={busy} disabled={!f.username}>ذخیره</SubmitButton><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <form id="user-form" onSubmit={save} noValidate>
        <ErrorSummary errors={errors} labels={LABELS} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="نام" htmlFor="f-first_name" error={errors.first_name}><Input id="f-first_name" autoComplete="given-name" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></FormField>
          <FormField label="نام خانوادگی" htmlFor="f-last_name" error={errors.last_name}><Input id="f-last_name" autoComplete="family-name" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></FormField>
          <FormField label="نام کاربری" htmlFor="f-username" required error={errors.username}><Input id="f-username" dir="ltr" autoComplete="off" spellCheck={false} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></FormField>
          <FormField label={item.id ? "رمز عبور جدید" : "رمز عبور"} htmlFor="f-password" error={errors.password} hint={item.id ? "برای تغییر ندادن، خالی بگذارید." : "حداقل ۸ نویسه"}>
            <PasswordInput id="f-password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </FormField>
          <FormField label="موبایل" htmlFor="f-mobile" error={errors.mobile}><PhoneInput id="f-mobile" value={f.mobile} onChange={(d) => setF({ ...f, mobile: d })} /></FormField>
          <FormField label="ایمیل" htmlFor="f-email" error={errors.email}><Input id="f-email" dir="ltr" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField>
          <FormField label="نقش‌ها" className="sm:col-span-2" error={errors.roles} hint="مجوزها از نقش‌ها می‌آیند؛ نقش‌ها را در «نقش‌ها و دسترسی‌ها» تعریف کنید.">
            <MultiSelect options={(roles.data ?? []).map((r) => ({ value: String(r.id), label: r.title }))} value={f.roles.map(String)}
              onChange={(v) => setF({ ...f, roles: v.map(Number) })} placeholder="انتخاب نقش" />
          </FormField>
          <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} aria-label="حساب فعال" /> حساب فعال است</label>
          {user?.is_superuser && (
            <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_superuser} onCheckedChange={(v) => setF({ ...f, is_superuser: v })} aria-label="مدیر کل" /> مدیر کل (همه‌ی مجوزها)</label>
          )}
        </div>
        {item.id && <p className="mt-4 text-sm text-muted-foreground">آخرین ورود: {item.last_login ? fa(new Date(item.last_login).toLocaleDateString("fa-IR")) : "هنوز وارد نشده"}</p>}
      </form>
    </GuardedDialog>
  );
}
