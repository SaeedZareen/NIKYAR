import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { del, get, patch, post } from "@/app/api";
import { LoadingBlock, PageHeader, Panel, SubmitButton, useApiAction } from "@/app/ui";
import { cn, fa } from "@/lib/utils";

type Role = { id: number; code: string; title: string; description: string; permissions: string[]; is_system: boolean; user_count: number };
type PermGroup = { module: string; title: string; permissions: { code: string; title: string }[] };

export default function RolesPage() {
  const qc = useQueryClient();
  const run = useApiAction();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => get<Role[]>("/roles/") });
  const perms = useQuery({ queryKey: ["perm-groups"], queryFn: () => get<PermGroup[]>("/roles/permissions/") });
  const [sel, setSel] = React.useState<Role | null>(null);
  const [draft, setDraft] = React.useState<Role | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (!sel && roles.data?.length) setSel(roles.data[0]); }, [roles.data, sel]);
  React.useEffect(() => setDraft(sel ? { ...sel } : null), [sel]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["roles"] });
  const save = async () => {
    if (!draft) return;
    const body = { code: draft.code, title: draft.title, description: draft.description, permissions: draft.permissions };
    setBusy(true);
    const r = await run(() => (draft.id ? patch<Role>(`/roles/${draft.id}/`, body) : post<Role>("/roles/", body)), "نقش ذخیره شد.");
    setBusy(false);
    if (r.ok && r.data) { await refresh(); setSel(r.data); }
  };
  const toggle = (code: string, on: boolean) => draft && setDraft({ ...draft, permissions: on ? [...draft.permissions, code] : draft.permissions.filter((p) => p !== code) });

  return (
    <>
      <PageHeader title="نقش‌ها و دسترسی‌ها" description="هر ماژول مجوزهای خودش را دارد. نقش مجموعه‌ای از مجوزهاست که به کاربران داده می‌شود."
        actions={<Button onClick={() => setSel({ id: 0, code: "", title: "", description: "", permissions: [], is_system: false, user_count: 0 })}><Plus className="size-4" aria-hidden /> نقش جدید</Button>} />
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Panel className="lg:col-span-4" bodyClassName="p-2">
          {roles.isLoading ? <LoadingBlock /> : (
            <ul aria-label="نقش‌ها">
              {(roles.data ?? []).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSel(r)} aria-current={sel?.id === r.id ? "true" : undefined}
                    className={cn("flex min-h-12 w-full items-center justify-between gap-2 rounded-control px-3 text-start text-sm", sel?.id === r.id ? "bg-accent font-medium" : "hover:bg-accent/60")}>
                    <span>{r.title}</span>
                    <span className="text-xs text-muted-foreground">{fa(r.user_count)} کاربر · {fa(r.permissions.length)} مجوز</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="lg:col-span-8">
          {!draft ? <EmptyState icon={ShieldCheck} title="یک نقش انتخاب کنید" /> : (
            <Panel title={draft.id ? draft.title : "نقش جدید"}
              actions={<>
                {draft.id > 0 && !draft.is_system && <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>حذف</Button>}
                <SubmitButton onClick={save} loading={busy} disabled={!draft.title || !draft.code || (!!sel && JSON.stringify(sel) === JSON.stringify(draft))}>ذخیره‌ی تغییرات</SubmitButton>
              </>}>
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <FormField label="عنوان" htmlFor="r-title" required><Input id="r-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></FormField>
                <FormField label="کد لاتین" htmlFor="r-code" required>
                  <Input id="r-code" dir="ltr" value={draft.code} disabled={draft.id > 0} onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
                </FormField>
              </div>
              <div className="space-y-6">
                {(perms.data ?? []).map((g) => (
                  <fieldset key={g.module}>
                    <legend className="mb-2 text-base font-semibold">{g.title} <span className="text-sm font-normal text-muted-foreground">({fa(g.permissions.filter((p) => draft.permissions.includes(p.code)).length)} از {fa(g.permissions.length)})</span></legend>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {g.permissions.map((p) => (
                        <label key={p.code} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 text-sm hover:bg-accent/50">
                          <Switch checked={draft.permissions.includes(p.code)} onCheckedChange={(v) => toggle(p.code, v)} aria-label={p.title} />
                          {p.title}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm} destructive title={`حذف نقش «${draft?.title ?? ""}»`} confirmText="حذف"
        description="کاربرانی که این نقش را دارند، مجوزهای آن را از دست می‌دهند."
        onConfirm={async () => { const r = await run(() => del(`/roles/${draft!.id}/`), "نقش حذف شد."); if (r.ok) { setSel(null); refresh(); } }} />
    </>
  );
}
