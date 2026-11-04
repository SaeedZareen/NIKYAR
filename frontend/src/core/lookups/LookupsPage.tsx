import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListTree, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { del, get, patch, post } from "@/app/api";
import { LoadingBlock, PageHeader, Panel, useApiAction } from "@/app/ui";
import { cn, fa } from "@/lib/utils";

type LType = { id: number; code: string; title: string; description: string; module: string; module_title: string; is_system: boolean; hierarchical: boolean; item_count: number };
type LItem = { id: number; type: number; code: string; title: string; parent: number | null; order: number; is_active: boolean };

export default function LookupsPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const types = useQuery({ queryKey: ["lookup-types"], queryFn: () => get<LType[]>("/lookups/types/") });
  const [term, setTerm] = React.useState("");
  const [newOpen, setNewOpen] = React.useState(false);
  React.useEffect(() => {
    if (!code && types.data?.length) navigate(`/lookups/${types.data[0].code}`, { replace: true });
  }, [code, types.data, navigate]);

  const groups = Object.entries((types.data ?? []).filter((t) => !term || t.title.includes(term) || t.code.includes(term))
    .reduce<Record<string, LType[]>>((acc, t) => { (acc[t.module_title] ||= []).push(t); return acc; }, {}));

  return (
    <>
      <PageHeader title="فهرست‌های پایه" description="مقادیر انتخابی سامانه. فهرست‌های قفل‌دار سیستمی هستند و منطق برنامه به آن‌ها وابسته است."
        actions={<Button onClick={() => setNewOpen(true)}><Plus className="size-4" /> فهرست جدید</Button>} />
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Panel className="lg:col-span-4" bodyClassName="p-3">
          <SearchInput value={term} onChange={setTerm} placeholder="جست‌وجوی فهرست" size="sm" />
          {types.isLoading ? <div className="mt-3"><LoadingBlock /></div> : (
            <nav className="mt-3 space-y-4" aria-label="فهرست‌ها">
              {groups.map(([g, list]) => (
                <div key={g}>
                  <div className="px-2 pb-1 text-xs text-muted-foreground">{g}</div>
                  {list.map((t) => (
                    <button key={t.code} type="button" onClick={() => navigate(`/lookups/${t.code}`)}
                      className={cn("flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-start text-sm transition-colors",
                        t.code === code ? "bg-accent font-medium" : "hover:bg-accent/60")}>
                      {t.is_system ? <Lock className="size-4 shrink-0 text-warning" aria-label="سیستمی" /> : <ListTree className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="flex-1 truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground">{fa(t.item_count)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          )}
        </Panel>
        <div className="lg:col-span-8">{code ? <ItemsPanel code={code} /> : <EmptyState icon={ListTree} title="یک فهرست انتخاب کنید" />}</div>
      </div>
      <NewTypeDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(c) => navigate(`/lookups/${c}`)} />
    </>
  );
}

function ItemsPanel({ code }: { code: string }) {
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["lookup-items", code], queryFn: () => get<{ type: LType; items: LItem[] }>(`/lookups/types/${code}/items/`) });
  const [title, setTitle] = React.useState("");
  const [parent, setParent] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(true);
  const [confirm, setConfirm] = React.useState<LItem | null>(null);
  const [delType, setDelType] = React.useState(false);
  const navigate = useNavigate();

  const refresh = () => { qc.invalidateQueries({ queryKey: ["lookup-items", code] }); qc.invalidateQueries({ queryKey: ["lookup-types"] }); qc.invalidateQueries({ queryKey: ["lookup-bundle"] }); };
  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (!q.data) return null;
  const { type: t, items } = q.data;
  const locked = t.is_system;
  const shown = items.filter((i) => showInactive || i.is_active);
  const titleOf = (id: number | null) => items.find((i) => i.id === id)?.title ?? "";

  const add = async () => {
    const r = await run(() => post("/lookups/items/", { type: t.id, title, parent: parent ? Number(parent) : null, order: items.length }), "مقدار اضافه شد.");
    if (r.ok) { setTitle(""); refresh(); }
  };
  const update = async (it: LItem, body: Partial<LItem>) => { const r = await run(() => patch(`/lookups/items/${it.id}/`, body)); if (r.ok) refresh(); };
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const r = await run(() => post(`/lookups/types/${code}/reorder/`, { ids }));
    if (r.ok) refresh();
  };

  return (
    <Panel title={<span className="flex items-center gap-2">{t.title} {locked ? <Badge variant="warning">سیستمی</Badge> : <Badge variant="success">قابل‌ویرایش</Badge>}</span>}
      description={<span dir="ltr">{t.code}</span>}
      actions={!locked && t.module === "custom" && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDelType(true)}><Trash2 className="size-4" /> حذف فهرست</Button>}>
      {locked ? (
        <Alert variant="warning" title="این فهرست قفل است" className="mb-4">
          منطق برنامه به مقادیر این فهرست وابسته است (مثلاً «{t.title}» در قواعد ماژول {t.module_title} استفاده می‌شود)؛ بنابراین افزودن، حذف یا ویرایش آن ممکن نیست.
          {t.description && <span className="mt-1 block">{t.description}</span>}
        </Alert>
      ) : (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <FormField label="مقدار جدید" htmlFor="li-title" className="min-w-48 flex-1">
            <Input id="li-title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && title.trim() && add()} />
          </FormField>
          {t.hierarchical && (
            <FormField label="زیرمجموعه‌ی" htmlFor="li-parent" className="min-w-40">
              <Select id="li-parent" value={parent} placeholder="سطح اول" onChange={(e) => setParent(e.target.value)}
                options={items.filter((i) => !i.parent).map((i) => ({ value: String(i.id), label: i.title }))} />
            </FormField>
          )}
          <Button onClick={add} disabled={!title.trim()}><Plus className="size-4" /> افزودن</Button>
        </div>
      )}
      <label className="mb-2 flex min-h-11 items-center gap-2 text-sm"><Switch checked={showInactive} onCheckedChange={setShowInactive} aria-label="نمایش غیرفعال‌ها" /> نمایش مقادیر غیرفعال</label>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-12">ردیف</TableHead><TableHead>عنوان</TableHead><TableHead>کد</TableHead>
            {t.hierarchical && <TableHead>والد</TableHead>}<TableHead>فعال</TableHead>{!locked && <TableHead className="w-40">عملیات</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {shown.map((it) => {
              const idx = items.indexOf(it);
              return (
                <TableRow key={it.id} className={cn(!it.is_active && "opacity-60")}>
                  <TableCell>{fa(idx + 1)}</TableCell>
                  <TableCell>
                    {locked ? it.title : <EditableTitle value={it.title} onSave={(v) => update(it, { title: v })} />}
                  </TableCell>
                  <TableCell><span dir="ltr" className="text-xs text-muted-foreground">{it.code}</span></TableCell>
                  {t.hierarchical && <TableCell>{titleOf(it.parent) || "—"}</TableCell>}
                  <TableCell><Switch checked={it.is_active} disabled={locked} onCheckedChange={(v) => update(it, { is_active: v })} aria-label={`فعال بودن ${it.title}`} /></TableCell>
                  {!locked && (
                    <TableCell>
                      <div className="flex">
                        <Button variant="ghost" size="icon" aria-label="بالا" onClick={() => move(idx, -1)}><ArrowUp className="size-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="پایین" onClick={() => move(idx, 1)}><ArrowDown className="size-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`حذف ${it.title}`} className="text-destructive" onClick={() => setConfirm(it)}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} destructive title={`حذف «${confirm?.title ?? ""}»`}
        description="اگر این مقدار در اطلاعات ثبت‌شده استفاده شده باشد، حذف نمی‌شود و فقط غیرفعال می‌شود."
        confirmText="حذف" onConfirm={async () => { const it = confirm!; setConfirm(null); await run(() => del(`/lookups/items/${it.id}/`), "حذف شد."); refresh(); }} />
      <AlertDialog open={delType} onOpenChange={setDelType} destructive title={`حذف فهرست «${t.title}»`} description="همه‌ی مقادیر این فهرست حذف می‌شوند." confirmText="حذف فهرست"
        onConfirm={async () => { const r = await run(() => del(`/lookups/types/${code}/`), "فهرست حذف شد."); if (r.ok) { refresh(); navigate("/lookups"); } }} />
    </Panel>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return <Input value={v} aria-label="عنوان" onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())}
    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}

function NewTypeDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (code: string) => void }) {
  const qc = useQueryClient();
  const run = useApiAction();
  const [f, setF] = React.useState({ title: "", code: "", description: "", hierarchical: false });
  const create = async () => {
    const r = await run(() => post<LType>("/lookups/types/", f), "فهرست ساخته شد.");
    if (r.ok && r.data) { qc.invalidateQueries({ queryKey: ["lookup-types"] }); onOpenChange(false); onCreated(r.data.code); setF({ title: "", code: "", description: "", hierarchical: false }); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="فهرست پایه‌ی جدید" description="فهرست‌های سفارشی در فرم‌ساز قابل استفاده‌اند."
      footer={<><Button onClick={create} disabled={!f.title || !f.code}>ایجاد</Button><Button variant="ghost" onClick={() => onOpenChange(false)}>انصراف</Button></>}>
      <div className="space-y-4">
        <FormField label="عنوان" htmlFor="nt-title" required><Input id="nt-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
        <FormField label="کد لاتین" htmlFor="nt-code" required hint="مثل skills"><Input id="nt-code" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} /></FormField>
        <FormField label="توضیحات" htmlFor="nt-desc"><Textarea id="nt-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></FormField>
        <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={f.hierarchical} onCheckedChange={(v) => setF({ ...f, hierarchical: v })} aria-label="درختی" /> فهرست درختی (مقادیر می‌توانند زیرمجموعه داشته باشند)</label>
      </div>
    </Dialog>
  );
}
