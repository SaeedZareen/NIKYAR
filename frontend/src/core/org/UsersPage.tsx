import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form";
import { get, patch, post } from "@/app/api";
import { useAuth } from "@/app/auth";
import { PageHeader, useApiAction } from "@/app/ui";
import { fa } from "@/lib/utils";

type User = {
  id: number; username: string; first_name: string; last_name: string; full_name: string; email: string; is_active: boolean;
  is_superuser: boolean; roles: number[]; role_titles: string[]; positions: { title: string; unit: string }[]; mobile: string; last_login: string | null;
};

export default function UsersPage() {
  const q = useQuery({ queryKey: ["users"], queryFn: () => get<User[]>("/users/") });
  const [edit, setEdit] = React.useState<Partial<User> | null>(null);
  const columns: Column<User & Record<string, unknown>>[] = [
    { key: "full_name", header: "نام", sortable: true, cell: (u) => <span className="flex items-center gap-2">{u.full_name}{u.is_superuser && <Badge variant="brand">مدیر کل</Badge>}</span> },
    { key: "username", header: "نام کاربری", cell: (u) => <span dir="ltr">{u.username}</span> },
    { key: "positions", header: "سمت", cell: (u) => u.positions.map((p) => `${p.title} (${p.unit})`).join("، ") || "—" },
    { key: "role_titles", header: "نقش‌ها", cell: (u) => u.role_titles.join("، ") || "—" },
    { key: "is_active", header: "وضعیت", cell: (u) => (u.is_active ? <Badge variant="success">فعال</Badge> : <Badge variant="secondary">غیرفعال</Badge>) },
  ];
  return (
    <>
      <PageHeader title="کاربران" description={`${fa(q.data?.filter((u) => u.is_active).length ?? 0)} کاربر فعال`}
        actions={<Button onClick={() => setEdit({ is_active: true, roles: [] })}><Plus className="size-4" /> کاربر جدید</Button>} />
      <DataTable rows={(q.data ?? []) as (User & Record<string, unknown>)[]} columns={columns} rowKey={(u) => String(u.id)} loading={q.isLoading}
        searchKeys={["full_name", "username"]} onRowClick={(u) => setEdit(u)} pageSize={15} />
      {edit && <UserDialog item={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function UserDialog({ item, onClose }: { item: Partial<User>; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const run = useApiAction();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => get<{ id: number; title: string }[]>("/roles/") });
  const [f, setF] = React.useState({
    username: item.username ?? "", first_name: item.first_name ?? "", last_name: item.last_name ?? "", email: item.email ?? "",
    mobile: item.mobile ?? "", password: "", is_active: item.is_active ?? true, is_superuser: item.is_superuser ?? false, roles: item.roles ?? [],
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = async () => {
    const body: Record<string, unknown> = { ...f };
    if (!f.password) delete body.password;
    const r = await run(() => (item.id ? patch(`/users/${item.id}/`, body) : post("/users/", body)), "کاربر ذخیره شد.");
    if (r.ok) { qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["users-brief"] }); onClose(); } else setErrors(r.fields ?? {});
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={item.id ? "ویرایش کاربر" : "کاربر جدید"} className="max-w-2xl"
      footer={<><Button onClick={save} disabled={!f.username}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="نام" htmlFor="us-fn" error={errors.first_name}><Input id="us-fn" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></FormField>
        <FormField label="نام خانوادگی" htmlFor="us-ln" error={errors.last_name}><Input id="us-ln" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></FormField>
        <FormField label="نام کاربری" htmlFor="us-un" required error={errors.username}><Input id="us-un" dir="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></FormField>
        <FormField label={item.id ? "رمز عبور جدید" : "رمز عبور"} htmlFor="us-pw" error={errors.password} hint={item.id ? "خالی بگذارید تا تغییر نکند." : "حداقل ۸ نویسه"}>
          <Input id="us-pw" dir="ltr" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </FormField>
        <FormField label="موبایل" htmlFor="us-mob" error={errors.mobile}><PhoneInput id="us-mob" value={f.mobile} onChange={(d) => setF({ ...f, mobile: d })} /></FormField>
        <FormField label="ایمیل" htmlFor="us-em" error={errors.email}><Input id="us-em" dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField>
        <FormField label="نقش‌ها" className="sm:col-span-2" error={errors.roles}>
          <MultiSelect options={(roles.data ?? []).map((r) => ({ value: String(r.id), label: r.title }))} value={f.roles.map(String)}
            onChange={(v) => setF({ ...f, roles: v.map(Number) })} placeholder="انتخاب نقش" />
        </FormField>
        <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} aria-label="فعال" /> فعال</label>
        {user?.is_superuser && (
          <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_superuser} onCheckedChange={(v) => setF({ ...f, is_superuser: v })} aria-label="مدیر کل" /> مدیر کل (همه‌ی مجوزها)</label>
        )}
      </div>
    </Dialog>
  );
}
