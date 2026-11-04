import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Pencil, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { get, patch, post } from "@/app/api";
import { LoadingBlock, PageHeader, useApiAction } from "@/app/ui";
import { useUsersBrief } from "@/core/forms/useFormRefs";
import { cn } from "@/lib/utils";

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
            <div className="font-semibold">{u.title}</div>
            <div dir="ltr" className="text-end text-xs text-muted-foreground">{u.code}</div>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEdit({ kind: "position", item: { unit: u.id, is_active: true } })}><UserPlus className="size-4" /> سمت</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit({ kind: "unit", item: { parent: u.id } })}><Plus className="size-4" /> زیرواحد</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit({ kind: "unit", item: u })}><Pencil className="size-4" /> ویرایش</Button>
          </div>
        </div>
        {u.positions.length > 0 ? (
          <ul className="divide-y divide-border">
            {u.positions.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setEdit({ kind: "position", item: p })}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-start text-sm hover:bg-accent/50">
                  <span className="flex items-center gap-2">
                    {p.is_manager && <Crown className="size-4 text-brand" aria-label="مدیر واحد" />}{p.title}
                    {!p.is_active && <Badge variant="secondary">غیرفعال</Badge>}
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
        actions={<Button onClick={() => setEdit({ kind: "unit", item: {} })}><Plus className="size-4" /> واحد جدید</Button>} />
      <ul className="space-y-1">{children(null).map((u) => render(u, 0))}</ul>
      {edit?.kind === "unit" && <UnitDialog item={edit.item} units={units} onClose={() => setEdit(null)} />}
      {edit?.kind === "position" && <PositionDialog item={edit.item} units={units} onClose={() => setEdit(null)} />}
    </>
  );
}

function useSaver(path: string, id: number | undefined, onClose: () => void) {
  const qc = useQueryClient();
  const run = useApiAction();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = async (body: unknown) => {
    const r = await run(() => (id ? patch(`${path}${id}/`, body) : post(path, body)), "ذخیره شد.");
    if (r.ok) { qc.invalidateQueries({ queryKey: ["org-units"] }); qc.invalidateQueries({ queryKey: ["directory"] }); onClose(); } else setErrors(r.fields ?? {});
  };
  return { save, errors };
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, "");

function UnitDialog({ item, units, onClose }: { item: Partial<Unit>; units: Unit[]; onClose: () => void }) {
  const [f, setF] = React.useState({ title: item.title ?? "", code: item.code ?? "", parent: item.parent ?? null });
  const { save, errors } = useSaver("/org/units/", item.id, onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={item.id ? "ویرایش واحد" : "واحد جدید"}
      footer={<><Button onClick={() => save(f)} disabled={!f.title || !f.code}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className="space-y-4">
        <FormField label="نام واحد" htmlFor="u-title" required error={errors.title}><Input id="u-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
        <FormField label="کد لاتین" htmlFor="u-code" required error={errors.code}><Input id="u-code" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: slug(e.target.value) })} /></FormField>
        <FormField label="واحد بالادستی" htmlFor="u-parent" error={errors.parent}>
          <Select id="u-parent" value={String(f.parent ?? "")} placeholder="بالاترین سطح" onChange={(e) => setF({ ...f, parent: e.target.value ? Number(e.target.value) : null })}
            options={units.filter((u) => u.id !== item.id).map((u) => ({ value: String(u.id), label: u.title }))} />
        </FormField>
      </div>
    </Dialog>
  );
}

function PositionDialog({ item, units, onClose }: { item: Partial<Position>; units: Unit[]; onClose: () => void }) {
  const users = useUsersBrief();
  const [f, setF] = React.useState({ title: item.title ?? "", code: item.code ?? "", unit: item.unit!, holder: item.holder ?? null, is_manager: item.is_manager ?? false, is_active: item.is_active ?? true });
  const { save, errors } = useSaver("/org/positions/", item.id, onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={item.id ? "ویرایش سمت" : "سمت جدید"}
      footer={<><Button onClick={() => save(f)} disabled={!f.title || !f.code}>ذخیره</Button><Button variant="ghost" onClick={onClose}>انصراف</Button></>}>
      <div className="space-y-4">
        <FormField label="عنوان سمت" htmlFor="p-title" required error={errors.title}><Input id="p-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
        <FormField label="کد لاتین" htmlFor="p-code" required error={errors.code} hint="در فرایندساز برای انتساب کار به این سمت استفاده می‌شود.">
          <Input id="p-code" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: slug(e.target.value) })} />
        </FormField>
        <FormField label="واحد" htmlFor="p-unit" error={errors.unit}>
          <Select id="p-unit" value={String(f.unit)} onChange={(e) => setF({ ...f, unit: Number(e.target.value) })} options={units.map((u) => ({ value: String(u.id), label: u.title }))} />
        </FormField>
        <FormField label="متصدی" htmlFor="p-holder" error={errors.holder}>
          <Select id="p-holder" value={String(f.holder ?? "")} placeholder="بدون متصدی" onChange={(e) => setF({ ...f, holder: e.target.value ? Number(e.target.value) : null })}
            options={(users.data ?? []).map((u) => ({ value: String(u.id), label: u.full_name }))} />
        </FormField>
        <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_manager} onCheckedChange={(v) => setF({ ...f, is_manager: v })} aria-label="مدیر واحد" /> مدیر این واحد است</label>
        {errors.is_manager && <p className="text-xs text-destructive">{errors.is_manager}</p>}
        <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} aria-label="فعال" /> فعال</label>
      </div>
    </Dialog>
  );
}
