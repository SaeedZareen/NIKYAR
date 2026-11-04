import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Pencil, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form";
import { get, patch, post } from "@/app/api";
import { ErrorSummary, GuardedDialog, LoadingBlock, PageHeader, StatusBadge, SubmitButton, useApiAction } from "@/app/ui";
import { useUsersBrief } from "@/core/forms/useFormRefs";
import { cn, fa } from "@/lib/utils";

type Position = { id: number; code: string; title: string; unit: number; holder: number | null; holder_name: string; is_manager: boolean; is_active: boolean };
type Unit = { id: number; code: string; title: string; parent: number | null; is_active: boolean; positions: Position[] };
type Edit = { kind: "unit"; item: Partial<Unit> } | { kind: "position"; item: Partial<Position> } | null;

export default function OrgPage() {
  const q = useQuery({ queryKey: ["org-units"], queryFn: () => get<Unit[]>("/org/units/") });
  const [edit, setEdit] = React.useState<Edit>(null);
  if (q.isLoading) return <LoadingBlock rows={8} />;
  const units = q.data ?? [];
  const children = (pid: number | null) => units.filter((u) => (u.parent ?? null) === pid);

  const render = (u: Unit, depth: number): React.ReactNode => (
    <li key={u.id} className={cn(depth > 0 && "border-s border-border ps-4")}>
      <div className="mb-3 rounded-surface border-line border-border bg-card shadow-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{u.title}</h2>
            <div dir="ltr" className="text-end text-xs text-muted-foreground">{u.code}</div>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" aria-label={`افزودن سمت به ${u.title}`} onClick={() => setEdit({ kind: "position", item: { unit: u.id, is_active: true } })}><UserPlus className="size-4" aria-hidden /> سمت</Button>
            <Button size="sm" variant="ghost" aria-label={`افزودن زیرواحد به ${u.title}`} onClick={() => setEdit({ kind: "unit", item: { parent: u.id } })}><Plus className="size-4" aria-hidden /> زیرواحد</Button>
            <Button size="sm" variant="ghost" aria-label={`ویرایش ${u.title}`} onClick={() => setEdit({ kind: "unit", item: u })}><Pencil className="size-4" aria-hidden /> ویرایش</Button>
          </div>
        </div>
        {u.positions.length > 0 ? (
          <ul className="divide-y divide-border">
            {u.positions.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setEdit({ kind: "position", item: p })}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-start text-sm hover:bg-accent/50">
                  <span className="flex items-center gap-2">
                    {p.is_manager && <Crown className="size-4 text-brand" aria-hidden />}{p.title}{p.is_manager && <span className="sr-only">(مدیر واحد)</span>}
                    {!p.is_active && <StatusBadge tone="neutral" label="غیرفعال" />}
                  </span>
                  <span className={p.holder_name ? "" : "text-muted-foreground"}>{p.holder_name || "بدون متصدی"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-3 text-sm text-muted-foreground">هنوز سمتی تعریف نشده است.</p>}
      </div>
      {children(u.id).length > 0 && <ul>{children(u.id).map((c) => render(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <>
      <PageHeader title="ساختار سازمانی" description="واحدها و سمت‌ها. انتساب کارها در فرایندها (مثل «مدیر مستقیم») بر اساس همین ساختار است."
        actions={<Button onClick={() => setEdit({ kind: "unit", item: {} })}><Plus className="size-4" aria-hidden /> واحد جدید</Button>} />
      <ul className="space-y-1" aria-label="درخت ساختار سازمانی">{children(null).map((u) => render(u, 0))}</ul>
      {edit?.kind === "unit" && <UnitDialog item={edit.item} units={units} onClose={() => setEdit(null)} />}
      {edit?.kind === "position" && <PositionDialog item={edit.item} units={units} onClose={() => setEdit(null)} />}
    </>
  );
}

function useSaver(path: string, id: number | undefined, onClose: () => void) {
  const qc = useQueryClient();
  const run = useApiAction();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const save = async (body: unknown) => {
    setBusy(true);
    const r = await run(() => (id ? patch(`${path}${id}/`, body) : post(path, body)), "ذخیره شد.");
    setBusy(false);
    if (r.ok) { qc.invalidateQueries({ queryKey: ["org-units"] }); qc.invalidateQueries({ queryKey: ["directory"] }); onClose(); } else setErrors(r.fields ?? {});
  };
  return { save, errors, busy };
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, "");

function UnitDialog({ item, units, onClose }: { item: Partial<Unit>; units: Unit[]; onClose: () => void }) {
  const init = { title: item.title ?? "", code: item.code ?? "", parent: item.parent ?? null };
  const [f, setF] = React.useState(init);
  const { save, errors, busy } = useSaver("/org/units/", item.id, onClose);
  return (
    <GuardedDialog open onOpenChange={(o) => !o && onClose()} dirty={JSON.stringify(f) !== JSON.stringify(init)} title={item.id ? "ویرایش واحد" : "واحد جدید"}
      footer={<><SubmitButton onClick={() => save(f)} loading={busy} disabled={!f.title || !f.code}>ذخیره</SubmitButton><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className="space-y-4">
        <ErrorSummary errors={errors} labels={{ title: "نام واحد", code: "کد لاتین", parent: "واحد بالادستی" }} />
        <FormField label="نام واحد" htmlFor="f-title" required error={errors.title}><Input id="f-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
        <FormField label="کد لاتین" htmlFor="f-code" required error={errors.code}><Input id="f-code" autoComplete="off" spellCheck={false} dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: slug(e.target.value) })} /></FormField>
        <FormField label="واحد بالادستی" htmlFor="u-parent" error={errors.parent}>
          <Select id="u-parent" value={String(f.parent ?? "")} placeholder="بالاترین سطح" onChange={(e) => setF({ ...f, parent: e.target.value ? Number(e.target.value) : null })}
            options={units.filter((u) => u.id !== item.id).map((u) => ({ value: String(u.id), label: u.title }))} />
        </FormField>
      </div>
    </GuardedDialog>
  );
}

function PositionDialog({ item, units, onClose }: { item: Partial<Position>; units: Unit[]; onClose: () => void }) {
  const users = useUsersBrief();
  const init = { title: item.title ?? "", code: item.code ?? "", unit: item.unit!, holder: item.holder ?? null, is_manager: item.is_manager ?? false, is_active: item.is_active ?? true };
  const [f, setF] = React.useState(init);
  const { save, errors, busy } = useSaver("/org/positions/", item.id, onClose);
  return (
    <GuardedDialog open onOpenChange={(o) => !o && onClose()} dirty={JSON.stringify(f) !== JSON.stringify(init)} title={item.id ? "ویرایش سمت" : "سمت جدید"}
      footer={<><SubmitButton onClick={() => save(f)} loading={busy} disabled={!f.title || !f.code}>ذخیره</SubmitButton><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className="space-y-4">
        <ErrorSummary errors={errors} labels={{ title: "عنوان سمت", code: "کد لاتین", unit: "واحد", holder: "متصدی", is_manager: "مدیر واحد" }} />
        <FormField label="عنوان سمت" htmlFor="f-title" required error={errors.title}><Input id="f-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
        <FormField label="کد لاتین" htmlFor="f-code" required error={errors.code} hint="در فرایندساز برای انتساب کار به این سمت استفاده می‌شود.">
          <Input id="f-code" autoComplete="off" spellCheck={false} dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: slug(e.target.value) })} />
        </FormField>
        <FormField label="واحد" htmlFor="p-unit" error={errors.unit}>
          <Select id="p-unit" value={String(f.unit)} onChange={(e) => setF({ ...f, unit: Number(e.target.value) })} options={units.map((u) => ({ value: String(u.id), label: u.title }))} />
        </FormField>
        <FormField label="متصدی" htmlFor="p-holder" error={errors.holder}>
          <Select id="p-holder" value={String(f.holder ?? "")} placeholder="بدون متصدی" onChange={(e) => setF({ ...f, holder: e.target.value ? Number(e.target.value) : null })}
            options={(users.data ?? []).map((u) => ({ value: String(u.id), label: u.full_name }))} />
        </FormField>
        <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_manager} onCheckedChange={(v) => setF({ ...f, is_manager: v })} aria-label="مدیر واحد" /> مدیر این واحد است</label>
        {errors.is_manager && <p id="f-is_manager" tabIndex={-1} className="text-sm text-destructive">{errors.is_manager}</p>}
        <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} aria-label="فعال" /> فعال</label>
        {item.id && <HolderHistory positionId={item.id} />}
      </div>
    </GuardedDialog>
  );
}

function HolderHistory({ positionId }: { positionId: number }) {
  const q = useQuery({ queryKey: ["position-history", positionId], queryFn: () => get<{ holder_name: string; started_at: string; ended_at: string | null; assigned_by: string }[]>(`/org/positions/${positionId}/history/`) });
  if (!q.data?.length) return null;
  return (
    <div>
      <div className="mb-2 text-sm font-medium">تاریخچه‌ی متصدیان</div>
      <ul className="space-y-1 text-sm">
        {q.data.map((h, i) => (
          <li key={i} className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0">
            <span>{h.holder_name}</span>
            <span className="text-muted-foreground">{fa(h.started_at)} تا {h.ended_at ? fa(h.ended_at) : "اکنون"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
