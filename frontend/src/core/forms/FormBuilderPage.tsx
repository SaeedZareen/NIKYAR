import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, Eye, GripVertical, PencilRuler, Plus, Rocket, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { get, patch, post } from "@/app/api";
import { ErrorBlock, LoadingBlock, PageHeader, Panel, useApiAction } from "@/app/ui";
import { cn, fa } from "@/lib/utils";
import { FormRenderer } from "./FormRenderer";
import { allFields, DISPLAY_ONLY, type FieldDef, type FieldType, type FormSchema, type SectionDef, type Values } from "./types";
import { CATALOG, catalogOf, newField, usedKeys } from "./builder/fieldCatalog";
import { FieldInspector, SectionInspector } from "./builder/FieldInspector";

export type FormRow = {
  id: number; key: string; title: string; description: string; category: string; entity: string; entity_title: string;
  is_active: boolean; draft_schema: FormSchema; latest_version: { version: number; published_at: string } | null;
  has_draft_changes: boolean; updated_at: string;
};

type Sel = { kind: "section"; sid: string } | { kind: "field"; sid: string; key: string } | null;
const SPAN: Record<number, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4" };
const GRID: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

export default function FormBuilderPage() {
  const { key } = useParams();
  const qc = useQueryClient();
  const run = useApiAction();
  const q = useQuery({ queryKey: ["form", key], queryFn: () => get<FormRow>(`/forms/${key}/`) });
  const [schema, setSchema] = React.useState<FormSchema | null>(null);
  const [sel, setSel] = React.useState<Sel>(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<Values>({});
  const [previewErrors, setPreviewErrors] = React.useState<Record<string, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  React.useEffect(() => {
    if (q.data && !schema) {
      setSchema(q.data.draft_schema);
      setSel({ kind: "section", sid: q.data.draft_schema.sections[0]?.id });
    }
  }, [q.data, schema]);

  React.useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (q.isLoading || (!schema && !q.error)) return <LoadingBlock rows={8} />;
  if (q.error || !q.data || !schema) return <ErrorBlock error={q.error} />;
  const form = q.data;

  const update = (next: FormSchema) => { setSchema(next); setDirty(true); };
  const updSection = (sid: string, fn: (s: SectionDef) => SectionDef) => update({ sections: schema.sections.map((s) => (s.id === sid ? fn(s) : s)) });
  const activeSid = sel?.sid ?? schema.sections[0]?.id;
  const addField = (type: FieldType) => {
    const f = newField(type, usedKeys(allFields(schema)));
    const sid = activeSid ?? schema.sections[0].id;
    updSection(sid, (s) => ({ ...s, fields: [...s.fields, { ...f, span: Math.min(f.span ?? 1, s.columns ?? 2) }] }));
    setSel({ kind: "field", sid, key: f.key });
  };
  const addSection = () => {
    let n = schema.sections.length + 1;
    while (schema.sections.some((s) => s.id === `s${n}`)) n++;
    const s: SectionDef = { id: `s${n}`, title: `بخش ${fa(n)}`, columns: 2, fields: [] };
    update({ sections: [...schema.sections, s] });
    setSel({ kind: "section", sid: s.id });
  };
  const onDragEnd = (sid: string) => (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    updSection(sid, (s) => {
      const from = s.fields.findIndex((f) => f.key === e.active.id);
      const to = s.fields.findIndex((f) => f.key === e.over!.id);
      return { ...s, fields: arrayMove(s.fields, from, to) };
    });
  };

  const save = async () => {
    const r = await patch<FormRow>(`/forms/${key}/`, { draft_schema: schema });
    qc.setQueryData(["form", key], r);
    setDirty(false);
    return r;
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    await run(async () => { const r = await fn(); await qc.invalidateQueries({ queryKey: ["form", key] }); return r; }, msg);
    setBusy(false);
  };
  const testPreview = async () => {
    setPreviewErrors({});
    const r = await run(() => post(`/forms/${key}/preview-validate/`, { schema, data: preview }), "اطلاعات واردشده معتبر است.");
    if (!r.ok) setPreviewErrors(r.fields ?? {});
  };

  const selSection = sel ? schema.sections.find((s) => s.id === sel.sid) : undefined;
  const selField = sel?.kind === "field" ? selSection?.fields.find((f) => f.key === sel.key) : undefined;
  const groups = [...new Set(CATALOG.map((c) => c.group))];

  return (
    <>
      <PageHeader title={form.title} crumbs={[{ label: "فرم‌ساز", to: "/forms" }]}
        description={<>
          {form.entity ? `فیلدهای سفارشی «${form.entity_title}» · ` : ""}
          {form.latest_version ? `نسخه‌ی منتشرشده: ${fa(form.latest_version.version)}` : "هنوز منتشر نشده"}
          {dirty ? " · تغییرات ذخیره‌نشده" : form.has_draft_changes && form.latest_version ? " · تغییرات منتشرنشده" : ""}
        </>}
        actions={<>
          <Button variant="outline" disabled={busy} onClick={() => act(() => post(`/forms/${key}/check/`, { schema }), "ساختار فرم درست است.")}><CheckCircle2 className="size-4" /> بررسی</Button>
          <Button variant="outline" disabled={busy || !dirty} onClick={() => act(save, "پیش‌نویس ذخیره شد.")}><Save className="size-4" /> ذخیره</Button>
          <Button variant="brand" disabled={busy} onClick={() => act(async () => { await save(); return post(`/forms/${key}/publish/`); }, "فرم منتشر شد.")}><Rocket className="size-4" /> انتشار</Button>
        </>} />
      <Tabs defaultValue="design" variant="underline">
        <TabsList>
          <TabsTrigger value="design"><PencilRuler className="size-4" /> طراحی</TabsTrigger>
          <TabsTrigger value="preview"><Eye className="size-4" /> پیش‌نمایش و آزمایش</TabsTrigger>
        </TabsList>
        <TabsContent value="design">
          <div className="grid items-start gap-4 lg:grid-cols-12">
            <aside className="space-y-4 lg:col-span-3" aria-label="انواع فیلد">
              <Panel title="افزودن فیلد" description={`به بخش «${schema.sections.find((s) => s.id === activeSid)?.title ?? ""}»`} bodyClassName="space-y-4 p-3">
                {groups.map((g) => (
                  <div key={g}>
                    <div className="mb-1 px-1 text-xs text-muted-foreground">{g}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {CATALOG.filter((c) => c.group === g).map((c) => (
                        <button key={c.type} type="button" onClick={() => addField(c.type)}
                          className="flex min-h-11 items-center gap-2 rounded-control px-2 text-start text-xs transition-colors hover:bg-accent">
                          <c.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} /> {c.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </Panel>
            </aside>
            <div className="space-y-4 lg:col-span-6">
              {schema.sections.map((s) => {
                const cols = s.columns ?? 2;
                const active = sel?.sid === s.id;
                return (
                  <section key={s.id} className={cn("rounded-surface border-line bg-card p-4 transition-colors", active ? "border-brand" : "border-border")}>
                    <button type="button" className="mb-3 w-full text-start" onClick={() => setSel({ kind: "section", sid: s.id })}>
                      <span className="block font-semibold">{s.title}</span>
                      <span className="text-xs text-muted-foreground">{fa(cols)} ستونه · {fa(s.fields.length)} فیلد · برای تنظیم بخش کلیک کنید</span>
                    </button>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(s.id)}>
                      <SortableContext items={s.fields.map((f) => f.key)} strategy={rectSortingStrategy}>
                        <div className={cn("grid grid-cols-1 gap-2", GRID[cols])}>
                          {s.fields.map((f) => (
                            <SortableField key={f.key} field={f} span={Math.min(f.span ?? 1, cols)}
                              selected={sel?.kind === "field" && sel.key === f.key} onSelect={() => setSel({ kind: "field", sid: s.id, key: f.key })} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    {!s.fields.length && <p className="rounded-field border-line border-dashed border-border p-6 text-center text-sm text-muted-foreground">از فهرست کنار صفحه فیلد اضافه کنید.</p>}
                  </section>
                );
              })}
              <Button variant="outline" className="w-full" onClick={addSection}><Plus className="size-4" /> افزودن بخش</Button>
            </div>
            <aside className="lg:col-span-3">
              <Panel title={selField ? "تنظیمات فیلد" : "تنظیمات بخش"} bodyClassName="p-4">
                {selField && selSection ? (
                  <FieldInspector key={selField.key} field={selField} sections={schema.sections} sectionId={selSection.id}
                    siblings={allFields(schema)} maxSpan={selSection.columns ?? 2}
                    onChange={(nf) => {
                      updSection(selSection.id, (s) => ({ ...s, fields: s.fields.map((f) => (f.key === selField.key ? nf : f)) }));
                      if (nf.key !== selField.key) setSel({ kind: "field", sid: selSection.id, key: nf.key });
                    }}
                    onRemove={() => { updSection(selSection.id, (s) => ({ ...s, fields: s.fields.filter((f) => f.key !== selField.key) })); setSel({ kind: "section", sid: selSection.id }); }}
                    onMoveSection={(to) => {
                      update({ sections: schema.sections.map((s) => s.id === selSection.id ? { ...s, fields: s.fields.filter((f) => f.key !== selField.key) }
                        : s.id === to ? { ...s, fields: [...s.fields, selField] } : s) });
                      setSel({ kind: "field", sid: to, key: selField.key });
                    }} />
                ) : selSection ? (
                  <SectionInspector section={selSection} canRemove={schema.sections.length > 1}
                    onChange={(ns) => updSection(selSection.id, () => ns)}
                    onRemove={() => { update({ sections: schema.sections.filter((s) => s.id !== selSection.id) }); setSel(null); }}
                    onMove={(d) => {
                      const i = schema.sections.findIndex((s) => s.id === selSection.id);
                      const j = i + d;
                      if (j < 0 || j >= schema.sections.length) return;
                      update({ sections: arrayMove(schema.sections, i, j) });
                    }} />
                ) : <p className="text-sm text-muted-foreground">یک بخش یا فیلد را انتخاب کنید.</p>}
              </Panel>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="preview">
          <div className="mx-auto max-w-3xl space-y-4">
            <Alert>فرم را مثل کاربر نهایی پر کنید و «آزمایش اعتبارسنجی» را بزنید. هیچ اطلاعاتی ذخیره نمی‌شود.</Alert>
            <Panel>
              <FormRenderer schema={schema} values={preview} onChange={setPreview} errors={previewErrors} />
              <div className="mt-6 flex gap-2">
                <Button onClick={testPreview}>آزمایش اعتبارسنجی</Button>
                <Button variant="ghost" onClick={() => { setPreview({}); setPreviewErrors({}); }}>پاک کردن</Button>
              </div>
            </Panel>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function SortableField({ field, span, selected, onSelect }: { field: FieldDef; span: number; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const cat = catalogOf(field.type);
  const display = DISPLAY_ONLY.includes(field.type);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex min-h-14 items-center gap-2 rounded-field border-line bg-background px-2 py-2", SPAN[span],
        selected ? "border-brand" : "border-border", isDragging && "z-10 opacity-80 shadow-overlay")}>
      <button type="button" {...attributes} {...listeners} aria-label={`جابه‌جایی ${field.label}`}
        className="inline-flex size-9 shrink-0 cursor-grab items-center justify-center rounded-control text-muted-foreground hover:bg-accent">
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-start">
        <cat.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0">
          <span className="block truncate text-sm">{field.label || "بدون عنوان"}{field.required && <span className="ms-1 text-destructive">*</span>}</span>
          <span className="block truncate text-xs text-muted-foreground">{cat.title}{!display && <> · <span dir="ltr">{field.key}</span></>}</span>
        </span>
        {field.visibleIf?.field && <Badge variant="brand">شرطی</Badge>}
      </button>
    </div>
  );
}
