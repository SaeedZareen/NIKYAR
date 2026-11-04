// فرم‌ساز «آنچه می‌بینید همان است که می‌گیرید»:
// جعبه‌ابزار فیلدها (راست) ← بوم با پیش‌نمایش واقعی فیلدها (وسط) ← تنظیمات (چپ).
// کشیدن از جعبه‌ابزار یا کلیک برای افزودن؛ جابه‌جایی با کشیدن یا کلیدها؛ واگرد/ازنو؛ ذخیره‌ی خودکار پیش‌نویس.
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowRight, ArrowUp, Check, CloudOff, Copy, Eye, GripVertical, Loader2, Monitor, MousePointerClick, PencilRuler, Plus, Redo2,
  Rocket, Smartphone, Trash2, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FormField } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { get, patch, post } from "@/app/api";
import { LoadingBlock, PageError, SubmitButton, useApiAction, useDocumentTitle } from "@/app/ui";
import { cn, fa } from "@/lib/utils";
import { FieldControl, FieldRow, FormRefsProvider, FormRenderer } from "./FormRenderer";
import { allFields, DISPLAY_ONLY, type FieldDef, type FieldType, type FormSchema, type SectionDef, type Values } from "./types";
import { CATALOG, catalogOf, newField, usedKeys } from "./builder/fieldCatalog";
import { FieldInspector, SectionInspector } from "./builder/Inspector";

export type FormRow = {
  id: number; key: string; title: string; description: string; category: string; entity: string; entity_title: string;
  is_active: boolean; draft_schema: FormSchema; latest_version: { version: number; published_at: string } | null;
  has_draft_changes: boolean; updated_at: string;
};
type Sel = { kind: "section"; sid: string } | { kind: "field"; sid: string; key: string } | null;
type SaveState = "saved" | "saving" | "dirty" | "error";

const DND_A11Y = {
  screenReaderInstructions: { draggable: "برای جابه‌جایی، فاصله یا Enter را بزنید؛ با کلیدهای جهت جابه‌جا کنید و دوباره فاصله را بزنید. Escape لغو می‌کند." },
  announcements: {
    onDragStart: () => "برداشته شد.", onDragOver: () => "روی جای جدید.", onDragEnd: () => "در جای جدید قرار گرفت.", onDragCancel: () => "جابه‌جایی لغو شد.",
  },
};

/** تاریخچه‌ی تغییرات برای واگرد/ازنو */
function useHistory<T>(initial: T | null) {
  const [state, setState] = React.useState<{ past: T[]; present: T | null; future: T[] }>({ past: [], present: initial, future: [] });
  return {
    value: state.present,
    reset: (v: T) => setState({ past: [], present: v, future: [] }),
    set: (v: T) => setState((s) => ({ past: s.present ? [...s.past.slice(-49), s.present] : s.past, present: v, future: [] })),
    undo: () => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: s.present ? [s.present, ...s.future] : s.future } : s)),
    redo: () => setState((s) => (s.future.length ? { past: s.present ? [...s.past, s.present] : s.past, present: s.future[0], future: s.future.slice(1) } : s)),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

export default function FormBuilderPage() {
  const { key } = useParams();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["form", key], queryFn: () => get<FormRow>(`/forms/${key}/`) });
  const hist = useHistory<FormSchema>(null);
  const schema = hist.value;
  const [sel, setSel] = React.useState<Sel>(null);
  const [mode, setMode] = React.useState<"design" | "preview">("design");
  const [save, setSave] = React.useState<SaveState>("saved");
  const [publishing, setPublishing] = React.useState(false);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [dragType, setDragType] = React.useState<FieldType | null>(null);
  const loaded = React.useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useDocumentTitle(q.data ? `فرم‌ساز: ${q.data.title}` : "فرم‌ساز");

  // ذخیره‌ی خودکار پیش‌نویس
  const lastSaved = React.useRef<string>("");
  const latest = React.useRef<string>("");
  React.useEffect(() => {
    if (q.data && !loaded.current) {
      loaded.current = true;
      lastSaved.current = JSON.stringify(q.data.draft_schema);
      hist.reset(q.data.draft_schema);
    }
  }, [q.data, hist]);

  React.useEffect(() => {
    if (!schema || !lastSaved.current) return;
    const json = JSON.stringify(schema);
    latest.current = json;
    if (json === lastSaved.current) { setSave("saved"); return; }
    setSave("dirty");
    const h = setTimeout(async () => {
      setSave("saving");
      try {
        const r = await patch<FormRow>(`/forms/${key}/`, { draft_schema: JSON.parse(json) });
        lastSaved.current = json;
        qc.setQueryData(["form", key], r);
        if (latest.current === json) setSave("saved");
      } catch { setSave("error"); }
    }, 900);
    return () => clearTimeout(h);
  }, [schema, key, qc]);

  // میان‌برهای صفحه‌کلید
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); if (e.shiftKey) hist.redo(); else hist.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); hist.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hist]);

  if (q.isLoading || (!schema && !q.error)) return <div className="p-4"><LoadingBlock rows={8} /></div>;
  if (q.error || !q.data || !schema) return <div className="p-4"><PageError error={q.error} onRetry={() => q.refetch()} back={{ to: "/forms", label: "فرم‌ساز" }} /></div>;
  const form = q.data;

  const update = (next: FormSchema) => hist.set(next);
  const updSection = (sid: string, fn: (s: SectionDef) => SectionDef) => update({ sections: schema.sections.map((s) => (s.id === sid ? fn(s) : s)) });
  const locate = (fkey: string) => {
    for (const s of schema.sections) { const i = s.fields.findIndex((f) => f.key === fkey); if (i >= 0) return { sid: s.id, index: i }; }
    return null;
  };
  const targetSection = () => (sel ? sel.sid : schema.sections[schema.sections.length - 1]?.id);

  const insert = (type: FieldType, sid: string, index?: number) => {
    const f = newField(type, usedKeys(allFields(schema)));
    updSection(sid, (s) => {
      const fields = [...s.fields];
      fields.splice(index ?? fields.length, 0, f);
      return { ...s, fields };
    });
    setSel({ kind: "field", sid, key: f.key });
  };
  const addFromToolbox = (type: FieldType) => {
    const sid = targetSection();
    if (!sid) return;
    const at = sel?.kind === "field" ? (locate(sel.key)?.index ?? -1) + 1 : undefined;
    insert(type, sid, at);
  };
  const removeField = (sid: string, fkey: string) => {
    updSection(sid, (s) => ({ ...s, fields: s.fields.filter((f) => f.key !== fkey) }));
    setSel({ kind: "section", sid });
  };
  const duplicate = (sid: string, f: FieldDef) => {
    const copy = { ...newField(f.type, usedKeys(allFields(schema))), ...structuredClone(f) };
    const fresh = newField(f.type, usedKeys(allFields(schema)));
    copy.key = fresh.key;
    copy.label = `${f.label} (کپی)`;
    updSection(sid, (s) => { const i = s.fields.findIndex((x) => x.key === f.key); const fields = [...s.fields]; fields.splice(i + 1, 0, copy); return { ...s, fields }; });
    setSel({ kind: "field", sid, key: copy.key });
  };
  const move = (sid: string, fkey: string, d: -1 | 1) => updSection(sid, (s) => {
    const i = s.fields.findIndex((f) => f.key === fkey); const j = i + d;
    return j < 0 || j >= s.fields.length ? s : { ...s, fields: arrayMove(s.fields, i, j) };
  });
  const addSection = () => {
    let n = schema.sections.length + 1;
    while (schema.sections.some((s) => s.id === `s${n}`)) n++;
    const s: SectionDef = { id: `s${n}`, title: `بخش ${fa(n)}`, columns: 2, fields: [] };
    update({ sections: [...schema.sections, s] });
    setSel({ kind: "section", sid: s.id });
  };
  const removeSection = (sid: string) => {
    if (schema.sections.length < 2) return;
    update({ sections: schema.sections.filter((s) => s.id !== sid) });
    setSel(null);
  };
  const moveSection = (sid: string, d: -1 | 1) => {
    const i = schema.sections.findIndex((s) => s.id === sid); const j = i + d;
    if (j >= 0 && j < schema.sections.length) update({ sections: arrayMove(schema.sections, i, j) });
  };

  const onDragStart = (e: DragStartEvent) => setDragType((e.active.data.current?.type as FieldType) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragType(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const target = overId.startsWith("s:") ? { sid: overId.slice(2), index: undefined as number | undefined }
      : overId.startsWith("f:") ? (() => { const l = locate(overId.slice(2)); return l ? { sid: l.sid, index: l.index } : null; })() : null;
    if (!target) return;
    const activeId = String(active.id);
    if (activeId.startsWith("new:")) { insert(activeId.slice(4) as FieldType, target.sid, target.index); return; }
    const fkey = activeId.slice(2);
    const from = locate(fkey);
    if (!from || activeId === overId) return;
    if (from.sid === target.sid && target.index !== undefined) { updSection(from.sid, (s) => ({ ...s, fields: arrayMove(s.fields, from.index, target.index!) })); return; }
    const field = schema.sections.find((s) => s.id === from.sid)!.fields[from.index];
    update({ sections: schema.sections.map((s) => {
      let fields = s.id === from.sid ? s.fields.filter((f) => f.key !== fkey) : s.fields;
      if (s.id === target.sid) { fields = [...fields]; fields.splice(target.index ?? fields.length, 0, field); }
      return { ...s, fields };
    }) });
    setSel({ kind: "field", sid: target.sid, key: fkey });
  };

  const publish = async () => {
    setPublishing(true);
    setProblems([]);
    const r = await run(async () => {
      await patch(`/forms/${key}/`, { draft_schema: schema });
      return post(`/forms/${key}/publish/`);
    }, "فرم منتشر شد و از این پس در فرایندها استفاده می‌شود.");
    setPublishing(false);
    if (r.ok) qc.invalidateQueries({ queryKey: ["form", key] });
    else if (r.fields?._schema) setProblems(String(r.fields._schema).split(","));
  };

  const selSection = sel ? schema.sections.find((s) => s.id === sel.sid) : undefined;
  const selField = sel?.kind === "field" ? selSection?.fields.find((f) => f.key === sel.key) : undefined;
  const fieldCount = allFields(schema).length;

  return (
    <div className="flex h-full flex-col">
      {/* نوار ابزار */}
      <div role="toolbar" aria-label="ابزار فرم‌ساز" className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Link to="/forms" className="inline-flex size-8 items-center justify-center rounded-control hover:bg-accent" aria-label="بازگشت به فهرست فرم‌ها"><ArrowRight className="size-4" aria-hidden /></Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold">{form.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {form.entity ? `فیلد سفارشی «${form.entity_title}» · ` : ""}
            {form.latest_version ? `نسخه‌ی منتشرشده ${fa(form.latest_version.version)}` : "هنوز منتشر نشده"}
            {form.latest_version && form.has_draft_changes ? " · تغییرات منتشرنشده دارد" : ""}
          </p>
        </div>
        <SaveIndicator state={save} />
        <span className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="واگرد (Ctrl+Z)" title="واگرد (Ctrl+Z)" disabled={!hist.canUndo} onClick={hist.undo}><Undo2 className="size-4" aria-hidden /></Button>
        <Button variant="ghost" size="icon" aria-label="ازنو (Ctrl+Y)" title="ازنو (Ctrl+Y)" disabled={!hist.canRedo} onClick={hist.redo}><Redo2 className="size-4" aria-hidden /></Button>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <SegmentedControl size="sm" value={mode} onChange={(v) => setMode(v as "design")} aria-label="حالت"
          options={[{ value: "design", label: <span className="flex items-center gap-1.5"><PencilRuler className="size-4" aria-hidden />طراحی</span> },
            { value: "preview", label: <span className="flex items-center gap-1.5"><Eye className="size-4" aria-hidden />پیش‌نمایش</span> }]} />
        <SubmitButton size="sm" onClick={publish} loading={publishing} loadingText="در حال انتشار…" disabled={save === "saving"}>
          <Rocket className="size-4" aria-hidden /> انتشار
        </SubmitButton>
      </div>
      {problems.length > 0 && (
        <div className="shrink-0 border-b border-border bg-destructive/5 px-4 py-2">
          <Alert variant="destructive" title="پیش از انتشار این موارد را اصلاح کنید">
            <ul className="list-inside list-disc">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </Alert>
        </div>
      )}

      {mode === "preview" ? <PreviewPane formKey={key!} schema={schema} /> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragType(null)} accessibility={DND_A11Y}>
          <div className="flex min-h-0 flex-1">
            <Toolbox onAdd={addFromToolbox} target={selSection?.title} />
            {/* بوم */}
            <div className="@container min-w-0 flex-1 overflow-y-auto bg-background p-4 lg:p-6" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
              <FormRefsProvider schema={schema}>
                <div className="mx-auto max-w-4xl space-y-4">
                  {fieldCount === 0 && (
                    <div className="rounded-surface border-line border-dashed border-input bg-card p-6 text-center">
                      <MousePointerClick className="mx-auto mb-2 size-8 text-brand" aria-hidden />
                      <p className="font-bold">فرم هنوز خالی است</p>
                      <p className="text-sm text-muted-foreground">از جعبه‌ابزار سمت راست، فیلد را بکشید و روی بخش رها کنید یا روی آن کلیک کنید.</p>
                    </div>
                  )}
                  {schema.sections.map((s, si) => (
                    <SectionCard key={s.id} section={s} index={si} total={schema.sections.length}
                      selected={sel?.kind === "section" && sel.sid === s.id} selectedField={sel?.kind === "field" && sel.sid === s.id ? sel.key : null}
                      onSelect={() => setSel({ kind: "section", sid: s.id })}
                      onSelectField={(k) => setSel({ kind: "field", sid: s.id, key: k })}
                      onTitle={(title) => updSection(s.id, (x) => ({ ...x, title }))}
                      onMove={(d) => moveSection(s.id, d)} onRemove={() => removeSection(s.id)}
                      onFieldMove={(k, d) => move(s.id, k, d)} onFieldDuplicate={(f) => duplicate(s.id, f)} onFieldRemove={(k) => removeField(s.id, k)} />
                  ))}
                  <Button variant="outline" className="w-full border-dashed" onClick={addSection}><Plus className="size-4" aria-hidden /> افزودن بخش جدید</Button>
                </div>
              </FormRefsProvider>
            </div>
            {/* تنظیمات */}
            <aside aria-label="تنظیمات" className="w-72 shrink-0 overflow-y-auto border-s border-border bg-card xl:w-80">
              {selField && selSection ? (
                <FieldInspector key={selField.key} field={selField} sections={schema.sections} sectionId={selSection.id} allFields={allFields(schema)}
                  onChange={(nf) => {
                    updSection(selSection.id, (s) => ({ ...s, fields: s.fields.map((f) => (f.key === selField.key ? nf : f)) }));
                    if (nf.key !== selField.key) setSel({ kind: "field", sid: selSection.id, key: nf.key });
                  }}
                  onMoveSection={(to) => {
                    update({ sections: schema.sections.map((s) => s.id === selSection.id ? { ...s, fields: s.fields.filter((f) => f.key !== selField.key) }
                      : s.id === to ? { ...s, fields: [...s.fields, selField] } : s) });
                    setSel({ kind: "field", sid: to, key: selField.key });
                  }} />
              ) : selSection ? (
                <SectionInspector key={selSection.id} section={selSection} onChange={(ns) => updSection(selSection.id, () => ns)} />
              ) : <FormSettings form={form} />}
            </aside>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragType && (
              <div className="flex items-center gap-2 rounded-control border-line border-brand bg-card px-3 py-2 text-sm font-medium shadow-overlay">
                {React.createElement(catalogOf(dragType).icon, { className: "size-4 text-brand", "aria-hidden": true })} {catalogOf(dragType).title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map = {
    saved: { icon: Check, text: "ذخیره شد", cls: "text-success" },
    saving: { icon: Loader2, text: "در حال ذخیره…", cls: "text-muted-foreground" },
    dirty: { icon: Loader2, text: "تغییرات ذخیره نشده", cls: "text-muted-foreground" },
    error: { icon: CloudOff, text: "ذخیره نشد؛ اتصال را بررسی کنید", cls: "text-destructive" },
  }[state];
  return (
    <span role="status" className={cn("ms-2 hidden items-center gap-1 text-xs sm:flex", map.cls)}>
      <map.icon className={cn("size-3.5", state === "saving" && "animate-spin")} aria-hidden /> {map.text}
    </span>
  );
}

function Toolbox({ onAdd, target }: { onAdd: (t: FieldType) => void; target?: string }) {
  const [term, setTerm] = React.useState("");
  const items = CATALOG.filter((c) => !term || c.title.includes(term) || c.group.includes(term));
  const groups = [...new Set(items.map((c) => c.group))];
  return (
    <aside aria-label="جعبه‌ابزار فیلدها" className="flex w-56 shrink-0 flex-col border-e border-border bg-card">
      <div className="space-y-1.5 border-b border-border p-2">
        <SearchInput value={term} onChange={setTerm} placeholder="جست‌وجوی نوع فیلد" aria-label="جست‌وجوی نوع فیلد" size="sm" />
        <p className="px-1 text-xs text-muted-foreground">بکشید و رها کنید یا کلیک کنید{target ? <> · افزودن به «{target}»</> : ""}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g} className="mb-2">
            <h2 className="px-1 pb-1 text-xs font-bold text-muted-foreground">{g}</h2>
            <ul className="space-y-0.5">
              {items.filter((c) => c.group === g).map((c) => <ToolboxItem key={c.type} type={c.type} onAdd={onAdd} />)}
            </ul>
          </div>
        ))}
        {!items.length && <p className="p-2 text-sm text-muted-foreground">نوع فیلدی با این نام نیست.</p>}
      </div>
    </aside>
  );
}

function ToolboxItem({ type, onAdd }: { type: FieldType; onAdd: (t: FieldType) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${type}`, data: { type } });
  const c = catalogOf(type);
  return (
    <li>
      <button ref={setNodeRef} type="button" {...listeners} {...attributes} onClick={() => onAdd(type)} aria-label={`افزودن ${c.title}`}
        className={cn("flex h-8 w-full cursor-grab items-center gap-2 rounded-control px-2 text-start text-sm hover:bg-accent active:cursor-grabbing", isDragging && "opacity-50")}>
        <c.icon className="size-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{c.title}</span>
      </button>
    </li>
  );
}

function SectionCard({ section: s, index, total, selected, selectedField, onSelect, onSelectField, onTitle, onMove, onRemove, onFieldMove, onFieldDuplicate, onFieldRemove }: {
  section: SectionDef; index: number; total: number; selected: boolean; selectedField: string | null;
  onSelect: () => void; onSelectField: (k: string) => void; onTitle: (t: string) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
  onFieldMove: (k: string, d: -1 | 1) => void; onFieldDuplicate: (f: FieldDef) => void; onFieldRemove: (k: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `s:${s.id}` });
  const cols = Math.min(s.columns ?? 2, 3);
  return (
    <section aria-label={`بخش ${s.title}`} className={cn("rounded-surface border-line bg-card shadow-surface", selected ? "border-brand ring-2 ring-brand/30" : "border-border")}>
      <div className="flex items-center gap-1 border-b border-border bg-muted/60 px-2 py-1.5">
        <Input value={s.title} onChange={(e) => onTitle(e.target.value)} onFocus={onSelect} aria-label="عنوان بخش"
          className="h-8 flex-1 border-transparent bg-transparent font-bold text-brand shadow-none hover:border-input" />
        <Button variant="ghost" size="icon" className="size-8" aria-label="بخش به بالا" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="size-4" aria-hidden /></Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="بخش به پایین" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="size-4" aria-hidden /></Button>
        <Button variant="ghost" size="sm" onClick={onSelect}>تنظیمات بخش</Button>
        <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label="حذف بخش" disabled={total < 2} onClick={onRemove}><Trash2 className="size-4" aria-hidden /></Button>
      </div>
      <div ref={setNodeRef} className={cn("p-3 transition-colors", isOver && "bg-accent/50")}>
        <SortableContext items={s.fields.map((f) => `f:${f.key}`)} strategy={rectSortingStrategy}>
          <ul className={cn("grid grid-cols-1 gap-2", cols >= 2 && "@3xl:grid-cols-2", cols >= 3 && "@6xl:grid-cols-3")}>
            {s.fields.map((f, i) => (
              <CanvasField key={f.key} field={f} first={i === 0} last={i === s.fields.length - 1} selected={selectedField === f.key}
                onSelect={() => onSelectField(f.key)} onMove={(d) => onFieldMove(f.key, d)} onDuplicate={() => onFieldDuplicate(f)} onRemove={() => onFieldRemove(f.key)} />
            ))}
          </ul>
        </SortableContext>
        {!s.fields.length && (
          <p className={cn("rounded-field border-line border-dashed p-6 text-center text-sm text-muted-foreground", isOver ? "border-brand text-brand" : "border-input")}>
            فیلد را اینجا رها کنید
          </p>
        )}
      </div>
    </section>
  );
}

function CanvasField({ field: f, first, last, selected, onSelect, onMove, onDuplicate, onRemove }: {
  field: FieldDef; first: boolean; last: boolean; selected: boolean;
  onSelect: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: `f:${f.key}` });
  const display = DISPLAY_ONLY.includes(f.type);
  const cat = catalogOf(f.type);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative rounded-field border-line bg-card p-2.5 transition-colors", (f.span ?? 1) > 1 && "col-span-full",
        selected ? "border-brand bg-accent/40 ring-2 ring-brand/25" : "border-transparent hover:border-input",
        isDragging && "z-20 opacity-70 shadow-overlay", isOver && !isDragging && "border-brand")}>
      {/* انتخاب فیلد با کلیک روی هر جای آن */}
      <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`انتخاب فیلد ${f.label} (${cat.title})`}
        className="absolute inset-0 z-0 rounded-field" />
      <div className="pointer-events-none relative" aria-hidden inert>
        {display ? (f.type === "heading" ? <h3 className="text-sm font-bold">{f.label}</h3> : <p className="text-sm text-muted-foreground">{f.label}</p>) : (
          <FieldRow label={<>{f.label || "بدون عنوان"}{f.visibleIf?.field && <span className="ms-1 text-xs font-normal text-brand">(شرطی)</span>}</>} required={f.required} hint={f.help} labelFor={`pv-${f.key}`}>
            <FieldControl id={`pv-${f.key}`} field={f} value={f.type === "table" ? [{}] : undefined} onChange={() => {}} compact />
          </FieldRow>
        )}
      </div>
      {/* ابزار فیلد */}
      <div className={cn("absolute -top-3 end-2 z-10 flex items-center gap-0.5 rounded-control border-line border-border bg-card p-0.5 shadow-surface",
        selected ? "flex" : "hidden group-hover:flex group-focus-within:flex")}>
        <button type="button" {...attributes} {...listeners} aria-label={`جابه‌جایی ${f.label}`} className="inline-flex size-7 cursor-grab items-center justify-center rounded-control hover:bg-accent"><GripVertical className="size-4" aria-hidden /></button>
        <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="به بالا" className="inline-flex size-7 items-center justify-center rounded-control hover:bg-accent disabled:opacity-40"><ArrowUp className="size-4" aria-hidden /></button>
        <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="به پایین" className="inline-flex size-7 items-center justify-center rounded-control hover:bg-accent disabled:opacity-40"><ArrowDown className="size-4" aria-hidden /></button>
        <button type="button" onClick={onDuplicate} aria-label={`کپی ${f.label}`} className="inline-flex size-7 items-center justify-center rounded-control hover:bg-accent"><Copy className="size-4" aria-hidden /></button>
        <button type="button" onClick={onRemove} aria-label={`حذف ${f.label}`} className="inline-flex size-7 items-center justify-center rounded-control text-destructive hover:bg-destructive/10"><Trash2 className="size-4" aria-hidden /></button>
      </div>
    </li>
  );
}

function FormSettings({ form }: { form: FormRow }) {
  const qc = useQueryClient();
  const run = useApiAction();
  const [f, setF] = React.useState({ title: form.title, description: form.description, category: form.category });
  const dirty = f.title !== form.title || f.description !== form.description || f.category !== form.category;
  return (
    <div>
      <div className="border-b border-border px-3 py-2.5 text-sm font-bold">مشخصات فرم</div>
      <div className="space-y-3 p-3">
        <p className="text-sm text-muted-foreground">برای تنظیم یک فیلد یا بخش، روی آن در بوم کلیک کنید.</p>
        <FormField label="عنوان فرم" htmlFor="fm-title" required><Input id="fm-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
        <FormField label="دسته" htmlFor="fm-cat"><Input id="fm-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></FormField>
        <FormField label="توضیحات" htmlFor="fm-desc"><Textarea id="fm-desc" value={f.description} autoResize onChange={(e) => setF({ ...f, description: e.target.value })} /></FormField>
        <Button size="sm" disabled={!dirty || !f.title} onClick={async () => {
          const r = await run(() => patch(`/forms/${form.key}/`, f), "مشخصات فرم ذخیره شد.");
          if (r.ok) qc.invalidateQueries({ queryKey: ["form", form.key] });
        }}>ذخیره‌ی مشخصات</Button>
        <dl className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">کلید فرم</dt><dd dir="ltr">{form.key}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">آخرین ویرایش</dt><dd className="tabular-nums">{fa(form.updated_at)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

function PreviewPane({ formKey, schema }: { formKey: string; schema: FormSchema }) {
  const run = useApiAction();
  const [values, setValues] = React.useState<Values>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [device, setDevice] = React.useState("desktop");
  const test = async () => {
    setErrors({});
    const r = await run(() => post(`/forms/${formKey}/preview-validate/`, { schema, data: values }), "اطلاعات واردشده معتبر است.");
    if (!r.ok) setErrors(r.fields ?? {});
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4 lg:p-6">
      <div className="mx-auto mb-3 flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">فرم را مثل کاربر نهایی پر کنید؛ هیچ اطلاعاتی ذخیره نمی‌شود.</p>
        <SegmentedControl size="sm" value={device} onChange={setDevice} aria-label="اندازه‌ی نمایش"
          options={[{ value: "desktop", label: <span className="flex items-center gap-1.5"><Monitor className="size-4" aria-hidden />دسکتاپ</span> },
            { value: "mobile", label: <span className="flex items-center gap-1.5"><Smartphone className="size-4" aria-hidden />موبایل</span> }]} />
      </div>
      <div className={cn("mx-auto rounded-surface border-line border-border bg-card p-4 shadow-surface", device === "mobile" ? "max-w-sm" : "max-w-4xl")}>
        <FormRenderer schema={schema} values={values} onChange={setValues} errors={errors} />
        <div className="mt-4 flex gap-2 border-t border-border pt-3">
          <Button size="sm" onClick={test}>آزمایش اعتبارسنجی</Button>
          <Button size="sm" variant="ghost" onClick={() => { setValues({}); setErrors({}); }}>پاک کردن</Button>
        </div>
      </div>
    </div>
  );
}
