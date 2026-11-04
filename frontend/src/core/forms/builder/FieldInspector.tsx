// پنل تنظیمات فیلد/بخش در فرم‌ساز
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { get } from "@/app/api";
import { en, fa } from "@/lib/utils";
import { DISPLAY_ONLY, type FieldDef, type FieldType, type SectionDef } from "../types";
import { CATALOG, catalogOf } from "./fieldCatalog";

type LookupType = { code: string; title: string; is_system: boolean; module_title: string };

const KEY_RE = /[^a-z0-9_]/g;

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} /> {label}
    </label>
  );
}

export function SectionInspector({ section, onChange, onRemove, onMove, canRemove }: {
  section: SectionDef; onChange: (s: SectionDef) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; canRemove: boolean;
}) {
  return (
    <div className="space-y-4">
      <FormField label="عنوان بخش" htmlFor="s-title" required>
        <Input id="s-title" value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} />
      </FormField>
      <FormField label="توضیح بخش" htmlFor="s-desc">
        <Textarea id="s-desc" value={section.description ?? ""} autoResize onChange={(e) => onChange({ ...section, description: e.target.value })} />
      </FormField>
      <FormField label="تعداد ستون‌ها">
        <SegmentedControl value={String(section.columns ?? 2)} onChange={(v) => onChange({ ...section, columns: Number(v) })} aria-label="تعداد ستون"
          options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: fa(n) }))} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onMove(-1)}><ArrowUp className="size-4" /> بالا</Button>
        <Button size="sm" variant="outline" onClick={() => onMove(1)}><ArrowDown className="size-4" /> پایین</Button>
        <Button size="sm" variant="ghost" className="text-destructive" disabled={!canRemove} onClick={onRemove}><Trash2 className="size-4" /> حذف بخش</Button>
      </div>
    </div>
  );
}

export function FieldInspector({ field, sections, sectionId, siblings, onChange, onRemove, onMoveSection, maxSpan }: {
  field: FieldDef; sections: SectionDef[]; sectionId: string; siblings: FieldDef[];
  onChange: (f: FieldDef) => void; onRemove: () => void; onMoveSection: (sectionId: string) => void; maxSpan: number;
}) {
  const lookups = useQuery({ queryKey: ["lookup-types"], queryFn: () => get<LookupType[]>("/lookups/types/") });
  const c = field.config ?? {};
  const setC = (patch: Partial<NonNullable<FieldDef["config"]>>) => onChange({ ...field, config: { ...c, ...patch } });
  const display = DISPLAY_ONLY.includes(field.type);
  const condFields = siblings.filter((f) => f.key !== field.key && !DISPLAY_ONLY.includes(f.type) && !["table", "file"].includes(f.type));
  const condField = condFields.find((f) => f.key === field.visibleIf?.field);

  return (
    <div className="space-y-4">
      <FormField label={display ? "متن" : "عنوان فیلد"} htmlFor="fi-label" required>
        {field.type === "paragraph"
          ? <Textarea id="fi-label" value={field.label} autoResize onChange={(e) => onChange({ ...field, label: e.target.value })} />
          : <Input id="fi-label" value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} />}
      </FormField>
      <FormField label="نوع فیلد" htmlFor="fi-type">
        <Select id="fi-type" value={field.type} options={CATALOG.map((x) => ({ value: x.type, label: `${x.title} (${x.group})` }))}
          onChange={(e) => onChange({ ...field, type: e.target.value as FieldType })} />
      </FormField>
      {!display && (
        <FormField label="شناسه‌ی فنی (لاتین)" htmlFor="fi-key" hint="در شرط‌ها، گزارش‌ها و اقدام‌های سیستمی استفاده می‌شود. پس از انتشار تغییرش ندهید.">
          <Input id="fi-key" dir="ltr" value={field.key} onChange={(e) => onChange({ ...field, key: e.target.value.toLowerCase().replace(KEY_RE, "") })} />
        </FormField>
      )}
      <FormField label="عرض (تعداد ستون)">
        <SegmentedControl value={String(Math.min(field.span ?? 1, maxSpan))} onChange={(v) => onChange({ ...field, span: Number(v) })} aria-label="عرض فیلد"
          options={Array.from({ length: maxSpan }, (_, i) => ({ value: String(i + 1), label: fa(i + 1) }))} />
      </FormField>
      {!display && (
        <>
          <Toggle label="الزامی" checked={!!field.required} onChange={(v) => onChange({ ...field, required: v })} />
          <Toggle label="همیشه فقط‌خواندنی" checked={!!field.readonly} onChange={(v) => onChange({ ...field, readonly: v })} />
          <FormField label="راهنما" htmlFor="fi-help"><Input id="fi-help" value={field.help ?? ""} onChange={(e) => onChange({ ...field, help: e.target.value })} /></FormField>
          {["text", "textarea"].includes(field.type) && (
            <FormField label="متن نمونه (placeholder)" htmlFor="fi-ph"><Input id="fi-ph" value={field.placeholder ?? ""} onChange={(e) => onChange({ ...field, placeholder: e.target.value })} /></FormField>
          )}
        </>
      )}

      {(field.type === "select" || field.type === "multiselect") && <OptionsEditor value={c.options ?? []} onChange={(options) => setC({ options })} />}
      {(field.type === "lookup" || field.type === "multilookup") && (
        <FormField label="فهرست پایه" htmlFor="fi-lookup" required hint={<Link to="/lookups" className="underline">مدیریت فهرست‌های پایه</Link>}>
          <Select id="fi-lookup" value={c.lookup ?? ""} placeholder="انتخاب فهرست"
            options={(lookups.data ?? []).map((l) => ({ value: l.code, label: `${l.title} (${l.module_title})` }))}
            onChange={(e) => setC({ lookup: e.target.value })} />
        </FormField>
      )}
      {["number", "amount"].includes(field.type) && (
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="حداقل" value={c.min} onChange={(min) => setC({ min })} />
          <NumInput label="حداکثر" value={c.max} onChange={(max) => setC({ max })} />
        </div>
      )}
      {field.type === "number" && <Toggle label="عدد اعشاری مجاز است" checked={!!c.decimal} onChange={(decimal) => setC({ decimal })} />}
      {["text", "textarea"].includes(field.type) && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumInput label="حداقل طول" value={c.minLength} onChange={(minLength) => setC({ minLength })} />
            <NumInput label="حداکثر طول" value={c.maxLength} onChange={(maxLength) => setC({ maxLength })} />
          </div>
          {field.type === "text" && (
            <>
              <FormField label="الگوی مجاز (Regex)" htmlFor="fi-pat"><Input id="fi-pat" dir="ltr" value={c.pattern ?? ""} onChange={(e) => setC({ pattern: e.target.value })} /></FormField>
              {c.pattern && <FormField label="پیام خطای الگو" htmlFor="fi-patm"><Input id="fi-patm" value={c.patternMessage ?? ""} onChange={(e) => setC({ patternMessage: e.target.value })} /></FormField>}
            </>
          )}
        </>
      )}
      {field.type === "file" && <NumInput label="حداکثر تعداد فایل" value={c.maxFiles} onChange={(maxFiles) => setC({ maxFiles })} />}
      {field.type === "table" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumInput label="حداقل ردیف" value={c.minRows} onChange={(minRows) => setC({ minRows })} />
            <NumInput label="حداکثر ردیف" value={c.maxRows} onChange={(maxRows) => setC({ maxRows })} />
          </div>
          <ColumnsEditor value={field.columns ?? []} onChange={(columns) => onChange({ ...field, columns })} lookups={lookups.data ?? []} />
        </>
      )}

      <Separator />
      <FormField label="نمایش شرطی" hint="فیلد فقط وقتی نمایش داده و بررسی می‌شود که شرط برقرار باشد.">
        <div className="space-y-2">
          <Select value={field.visibleIf?.field ?? ""} placeholder="همیشه نمایش داده شود" aria-label="فیلد شرط"
            options={condFields.map((f) => ({ value: f.key, label: f.label }))}
            onChange={(e) => onChange({ ...field, visibleIf: e.target.value ? { field: e.target.value, op: "eq", value: "" } : null })} />
          {field.visibleIf?.field && (
            <>
              <Select value={field.visibleIf.op} aria-label="نوع شرط" onChange={(e) => onChange({ ...field, visibleIf: { ...field.visibleIf!, op: e.target.value as "eq" } })}
                options={[{ value: "eq", label: "برابر باشد با" }, { value: "neq", label: "برابر نباشد با" }, { value: "filled", label: "پر شده باشد" }, { value: "empty", label: "خالی باشد" }]} />
              {["eq", "neq"].includes(field.visibleIf.op) && (
                condField?.config?.options ? (
                  <Select value={field.visibleIf.value ?? ""} aria-label="مقدار" placeholder="انتخاب مقدار" options={condField.config.options}
                    onChange={(e) => onChange({ ...field, visibleIf: { ...field.visibleIf!, value: e.target.value } })} />
                ) : condField?.type === "checkbox" ? (
                  <Select value={field.visibleIf.value ?? ""} aria-label="مقدار" options={[{ value: "true", label: "بله" }, { value: "false", label: "خیر" }]}
                    onChange={(e) => onChange({ ...field, visibleIf: { ...field.visibleIf!, value: e.target.value } })} />
                ) : (
                  <Input value={field.visibleIf.value ?? ""} aria-label="مقدار" placeholder="مقدار (برای فهرست پایه، کد مقدار)"
                    onChange={(e) => onChange({ ...field, visibleIf: { ...field.visibleIf!, value: e.target.value } })} />
                )
              )}
            </>
          )}
        </div>
      </FormField>

      {sections.length > 1 && (
        <FormField label="انتقال به بخش" htmlFor="fi-sec">
          <Select id="fi-sec" value={sectionId} options={sections.map((s) => ({ value: s.id, label: s.title }))} onChange={(e) => onMoveSection(e.target.value)} />
        </FormField>
      )}
      <Button variant="ghost" className="text-destructive" onClick={onRemove}><Trash2 className="size-4" /> حذف فیلد</Button>
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: unknown; onChange: (v: number | undefined) => void }) {
  const id = React.useId();
  return (
    <FormField label={label} htmlFor={id}>
      <Input id={id} inputMode="numeric" value={value === undefined || value === null || value === "" ? "" : fa(String(value))}
        onChange={(e) => { const v = en(e.target.value).replace(/[^\d-]/g, ""); onChange(v === "" ? undefined : Number(v)); }} />
    </FormField>
  );
}

function OptionsEditor({ value, onChange }: { value: { value: string; label: string }[]; onChange: (v: { value: string; label: string }[]) => void }) {
  const upd = (i: number, patch: Partial<{ value: string; label: string }>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <FormField label="گزینه‌ها" hint="برای فهرست‌های بلند یا مشترک بین فرم‌ها، از «فهرست پایه» استفاده کنید.">
      <div className="space-y-2">
        {value.map((o, i) => (
          <div key={i} className="flex gap-2">
            <Input value={o.label} placeholder="عنوان" aria-label={`عنوان گزینه‌ی ${fa(i + 1)}`} onChange={(e) => upd(i, { label: e.target.value })} />
            <Input dir="ltr" className="w-28" value={o.value} placeholder="code" aria-label={`کد گزینه‌ی ${fa(i + 1)}`}
              onChange={(e) => upd(i, { value: e.target.value.replace(/[^A-Za-z0-9_-]/g, "") })} />
            <Button variant="ghost" size="icon" aria-label="حذف گزینه" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => onChange([...value, { value: `opt${value.length + 1}`, label: "" }])}><Plus className="size-4" /> گزینه</Button>
      </div>
    </FormField>
  );
}

const COLUMN_TYPES: FieldType[] = ["text", "number", "amount", "date", "select", "lookup", "checkbox", "national_id", "mobile"];

function ColumnsEditor({ value, onChange, lookups }: { value: FieldDef[]; onChange: (v: FieldDef[]) => void; lookups: LookupType[] }) {
  const upd = (i: number, patch: Partial<FieldDef>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <FormField label="ستون‌های جدول">
      <div className="space-y-2">
        {value.map((col, i) => (
          <div key={i} className="space-y-2 rounded-field border-line border-border p-2">
            <div className="flex gap-2">
              <Input value={col.label} placeholder="عنوان ستون" aria-label="عنوان ستون" onChange={(e) => upd(i, { label: e.target.value })} />
              <Input dir="ltr" className="w-28" value={col.key} aria-label="شناسه" onChange={(e) => upd(i, { key: e.target.value.toLowerCase().replace(KEY_RE, "") })} />
            </div>
            <div className="flex items-center gap-2">
              <Select value={col.type} aria-label="نوع ستون" options={COLUMN_TYPES.map((t) => ({ value: t, label: catalogOf(t).title }))}
                onChange={(e) => upd(i, { type: e.target.value as FieldType, config: e.target.value === "select" ? { options: [{ value: "a", label: "الف" }] } : {} })} />
              <label className="flex shrink-0 items-center gap-2 text-xs"><Switch checked={!!col.required} onCheckedChange={(v) => upd(i, { required: v })} aria-label="الزامی" /> الزامی</label>
              <Button variant="ghost" size="icon" aria-label="حذف ستون" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
            {col.type === "lookup" && (
              <Select value={col.config?.lookup ?? ""} placeholder="فهرست پایه" aria-label="فهرست پایه" options={lookups.map((l) => ({ value: l.code, label: l.title }))}
                onChange={(e) => upd(i, { config: { lookup: e.target.value } })} />
            )}
            {col.type === "select" && <OptionsEditor value={col.config?.options ?? []} onChange={(options) => upd(i, { config: { options } })} />}
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => onChange([...value, { key: `col${value.length + 1}`, type: "text", label: "" }])}><Plus className="size-4" /> ستون</Button>
      </div>
    </FormField>
  );
}
