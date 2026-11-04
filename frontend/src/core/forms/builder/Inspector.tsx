// پنل تنظیمات فرم‌ساز: زبانه‌های «عمومی، اعتبارسنجی، نمایش شرطی، پیشرفته».
// تنظیمات فنی (شناسه، الگو) پشت «پیشرفته» پنهان‌اند تا کاربر عادی با آن‌ها روبه‌رو نشود.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { get } from "@/app/api";
import { cn, en, fa } from "@/lib/utils";
import { DISPLAY_ONLY, type FieldDef, type FieldType, type SectionDef } from "../types";
import { CATALOG, catalogOf } from "./fieldCatalog";

type LookupType = { code: string; title: string; is_system: boolean; module_title: string };
const KEY_RE = /[^a-z0-9_]/g;

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
        <Switch checked={checked} onCheckedChange={onChange} aria-label={label} /> {label}
      </label>
      {hint && <p className="ms-14 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumInput({ label, value, onChange, hint }: { label: string; value: unknown; onChange: (v: number | undefined) => void; hint?: string }) {
  const id = React.useId();
  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <Input id={id} inputMode="numeric" value={value === undefined || value === null || value === "" ? "" : fa(String(value))}
        onChange={(e) => { const v = en(e.target.value).replace(/[^\d-]/g, ""); onChange(v === "" ? undefined : Number(v)); }} />
    </FormField>
  );
}

const TABS = [
  { value: "general", label: "عمومی" },
  { value: "validation", label: "قواعد" },
  { value: "condition", label: "شرط نمایش" },
  { value: "advanced", label: "پیشرفته" },
];

export function FieldInspector({ field, sections, sectionId, allFields, onChange, onMoveSection }: {
  field: FieldDef; sections: SectionDef[]; sectionId: string; allFields: FieldDef[];
  onChange: (f: FieldDef) => void; onMoveSection: (sectionId: string) => void;
}) {
  const [tab, setTab] = React.useState("general");
  const display = DISPLAY_ONLY.includes(field.type);
  const tabs = display ? TABS.filter((t) => t.value === "general" || t.value === "condition") : TABS;
  const cat = catalogOf(field.type);
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <cat.icon className="size-4 text-brand" aria-hidden />
        <span className="text-sm font-bold">{cat.title}</span>
      </div>
      <div role="tablist" aria-label="بخش تنظیمات" className="flex border-b border-border px-1">
        {tabs.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
            className={cn("-mb-px h-9 flex-1 whitespace-nowrap border-b-2 px-1 text-sm",
              tab === t.value ? "border-brand font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-3">
        {tab === "general" && <GeneralTab field={field} onChange={onChange} />}
        {tab === "validation" && <ValidationTab field={field} onChange={onChange} />}
        {tab === "condition" && <ConditionTab field={field} allFields={allFields} onChange={onChange} />}
        {tab === "advanced" && <AdvancedTab field={field} sections={sections} sectionId={sectionId} onChange={onChange} onMoveSection={onMoveSection} />}
      </div>
    </div>
  );
}

function GeneralTab({ field, onChange }: { field: FieldDef; onChange: (f: FieldDef) => void }) {
  const lookups = useQuery({ queryKey: ["lookup-types"], queryFn: () => get<LookupType[]>("/lookups/types/") });
  const c = field.config ?? {};
  const setC = (patch: Partial<NonNullable<FieldDef["config"]>>) => onChange({ ...field, config: { ...c, ...patch } });
  const display = DISPLAY_ONLY.includes(field.type);
  return (
    <>
      <FormField label={display ? "متن" : "عنوان فیلد"} htmlFor="fi-label" required>
        {field.type === "paragraph"
          ? <Textarea id="fi-label" value={field.label} autoResize onChange={(e) => onChange({ ...field, label: e.target.value })} />
          : <Input id="fi-label" value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} autoFocus />}
      </FormField>
      {!display && (
        <>
          <Toggle label="پر کردن الزامی است" checked={!!field.required} onChange={(v) => onChange({ ...field, required: v })} />
          <FormField label="راهنمای زیر فیلد" htmlFor="fi-help" hint="یک جمله‌ی کوتاه که به کاربر کمک می‌کند.">
            <Input id="fi-help" value={field.help ?? ""} onChange={(e) => onChange({ ...field, help: e.target.value })} />
          </FormField>
        </>
      )}
      <FormField label="عرض در فرم">
        <SegmentedControl size="sm" value={(field.span ?? 1) > 1 ? "full" : "half"} aria-label="عرض در فرم"
          onChange={(v) => onChange({ ...field, span: v === "full" ? 4 : 1 })}
          options={[{ value: "half", label: "یک ستون" }, { value: "full", label: "تمام عرض" }]} />
      </FormField>
      {(field.type === "select" || field.type === "multiselect") && <OptionsEditor value={c.options ?? []} onChange={(options) => setC({ options })} />}
      {(field.type === "lookup" || field.type === "multilookup") && (
        <FormField label="فهرست پایه" htmlFor="fi-lookup" required hint={<Link to="/lookups" className="text-brand underline">مدیریت فهرست‌های پایه</Link>}>
          <Select id="fi-lookup" value={c.lookup ?? ""} placeholder="انتخاب فهرست"
            options={(lookups.data ?? []).map((l) => ({ value: l.code, label: `${l.title} (${l.module_title})` }))}
            onChange={(e) => setC({ lookup: e.target.value })} />
        </FormField>
      )}
      {field.type === "table" && <ColumnsEditor value={field.columns ?? []} onChange={(columns) => onChange({ ...field, columns })} lookups={lookups.data ?? []} />}
      {["text", "textarea"].includes(field.type) && (
        <FormField label="متن نمونه داخل فیلد" htmlFor="fi-ph" hint="فقط نمونه است، جایگزین عنوان نمی‌شود.">
          <Input id="fi-ph" value={field.placeholder ?? ""} onChange={(e) => onChange({ ...field, placeholder: e.target.value })} />
        </FormField>
      )}
    </>
  );
}

function ValidationTab({ field, onChange }: { field: FieldDef; onChange: (f: FieldDef) => void }) {
  const c = field.config ?? {};
  const setC = (patch: Partial<NonNullable<FieldDef["config"]>>) => onChange({ ...field, config: { ...c, ...patch } });
  const any = ["number", "amount", "text", "textarea", "file", "table"].includes(field.type);
  return (
    <>
      <Toggle label="همیشه فقط‌خواندنی" checked={!!field.readonly} onChange={(v) => onChange({ ...field, readonly: v })}
        hint="مقدار نمایش داده می‌شود ولی در هیچ مرحله‌ای قابل ویرایش نیست." />
      {["number", "amount"].includes(field.type) && (
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="حداقل" value={c.min} onChange={(min) => setC({ min })} />
          <NumInput label="حداکثر" value={c.max} onChange={(max) => setC({ max })} />
        </div>
      )}
      {field.type === "number" && <Toggle label="عدد اعشاری مجاز است" checked={!!c.decimal} onChange={(decimal) => setC({ decimal })} />}
      {["text", "textarea"].includes(field.type) && (
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="حداقل نویسه" value={c.minLength} onChange={(minLength) => setC({ minLength })} />
          <NumInput label="حداکثر نویسه" value={c.maxLength} onChange={(maxLength) => setC({ maxLength })} />
        </div>
      )}
      {field.type === "file" && <NumInput label="حداکثر تعداد فایل" value={c.maxFiles} onChange={(maxFiles) => setC({ maxFiles })} />}
      {field.type === "table" && (
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="حداقل ردیف" value={c.minRows} onChange={(minRows) => setC({ minRows })} />
          <NumInput label="حداکثر ردیف" value={c.maxRows} onChange={(maxRows) => setC({ maxRows })} />
        </div>
      )}
      {!any && <p className="text-sm text-muted-foreground">این نوع فیلد قاعده‌ی اعتبارسنجی بیشتری ندارد؛ قالب آن (مثلاً کد ملی یا شبا) خودکار بررسی می‌شود.</p>}
    </>
  );
}

function ConditionTab({ field, allFields, onChange }: { field: FieldDef; allFields: FieldDef[]; onChange: (f: FieldDef) => void }) {
  const condFields = allFields.filter((f) => f.key !== field.key && !DISPLAY_ONLY.includes(f.type) && !["table", "file"].includes(f.type));
  const cond = field.visibleIf;
  const target = condFields.find((f) => f.key === cond?.field);
  return (
    <>
      <p className="text-sm text-muted-foreground">فیلد فقط وقتی نمایش داده و بررسی می‌شود که شرط زیر برقرار باشد.</p>
      <FormField label="وقتی فیلد" htmlFor="ci-field">
        <Select id="ci-field" value={cond?.field ?? ""} placeholder="همیشه نمایش داده شود"
          options={condFields.map((f) => ({ value: f.key, label: f.label }))}
          onChange={(e) => onChange({ ...field, visibleIf: e.target.value ? { field: e.target.value, op: "eq", value: "" } : null })} />
      </FormField>
      {cond?.field && (
        <>
          <FormField label="شرط" htmlFor="ci-op">
            <Select id="ci-op" value={cond.op} onChange={(e) => onChange({ ...field, visibleIf: { ...cond, op: e.target.value as "eq" } })}
              options={[{ value: "eq", label: "برابر باشد با" }, { value: "neq", label: "برابر نباشد با" }, { value: "filled", label: "پر شده باشد" }, { value: "empty", label: "خالی باشد" }]} />
          </FormField>
          {["eq", "neq"].includes(cond.op) && (
            <FormField label="مقدار" htmlFor="ci-val">
              {target?.config?.options ? (
                <Select id="ci-val" value={cond.value ?? ""} placeholder="انتخاب مقدار" options={target.config.options}
                  onChange={(e) => onChange({ ...field, visibleIf: { ...cond, value: e.target.value } })} />
              ) : target?.type === "checkbox" ? (
                <Select id="ci-val" value={cond.value ?? ""} options={[{ value: "true", label: "بله" }, { value: "false", label: "خیر" }]}
                  onChange={(e) => onChange({ ...field, visibleIf: { ...cond, value: e.target.value } })} />
              ) : (
                <Input id="ci-val" value={cond.value ?? ""} onChange={(e) => onChange({ ...field, visibleIf: { ...cond, value: e.target.value } })} />
              )}
            </FormField>
          )}
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...field, visibleIf: null })}>حذف شرط</Button>
        </>
      )}
    </>
  );
}

function AdvancedTab({ field, sections, sectionId, onChange, onMoveSection }: {
  field: FieldDef; sections: SectionDef[]; sectionId: string; onChange: (f: FieldDef) => void; onMoveSection: (id: string) => void;
}) {
  const c = field.config ?? {};
  return (
    <>
      <FormField label="شناسه‌ی فنی (لاتین)" htmlFor="fi-key" hint="در شرط مسیرهای فرایند، گزارش‌ها و اقدام‌های سیستمی استفاده می‌شود. پس از انتشار تغییرش ندهید.">
        <Input id="fi-key" dir="ltr" value={field.key} autoComplete="off" spellCheck={false}
          onChange={(e) => onChange({ ...field, key: e.target.value.toLowerCase().replace(KEY_RE, "") })} />
      </FormField>
      <FormField label="نوع فیلد" htmlFor="fi-type" hint="تغییر نوع ممکن است تنظیمات فعلی را بی‌اثر کند.">
        <Select id="fi-type" value={field.type} options={CATALOG.map((x) => ({ value: x.type, label: `${x.title} (${x.group})` }))}
          onChange={(e) => onChange({ ...field, type: e.target.value as FieldType })} />
      </FormField>
      {field.type === "text" && (
        <>
          <FormField label="الگوی مجاز (Regex)" htmlFor="fi-pat"><Input id="fi-pat" dir="ltr" value={c.pattern ?? ""} onChange={(e) => onChange({ ...field, config: { ...c, pattern: e.target.value } })} /></FormField>
          {c.pattern && <FormField label="پیام خطای الگو" htmlFor="fi-patm"><Input id="fi-patm" value={c.patternMessage ?? ""} onChange={(e) => onChange({ ...field, config: { ...c, patternMessage: e.target.value } })} /></FormField>}
        </>
      )}
      {sections.length > 1 && (
        <FormField label="انتقال به بخش" htmlFor="fi-sec">
          <Select id="fi-sec" value={sectionId} options={sections.map((s) => ({ value: s.id, label: s.title }))} onChange={(e) => onMoveSection(e.target.value)} />
        </FormField>
      )}
    </>
  );
}

export function SectionInspector({ section, onChange }: { section: SectionDef; onChange: (s: SectionDef) => void }) {
  return (
    <div>
      <div className="border-b border-border px-3 py-2.5 text-sm font-bold">تنظیمات بخش</div>
      <div className="space-y-3 p-3">
        <FormField label="عنوان بخش" htmlFor="s-title" required>
          <Input id="s-title" value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} />
        </FormField>
        <FormField label="توضیح بخش" htmlFor="s-desc">
          <Textarea id="s-desc" value={section.description ?? ""} autoResize onChange={(e) => onChange({ ...section, description: e.target.value })} />
        </FormField>
        <FormField label="تعداد ستون در نمایشگر بزرگ" hint="روی لپ‌تاپ حداکثر دو ستون و روی موبایل یک ستون نمایش داده می‌شود.">
          <SegmentedControl size="sm" value={String(section.columns ?? 2)} onChange={(v) => onChange({ ...section, columns: Number(v) })} aria-label="تعداد ستون"
            options={[1, 2, 3].map((n) => ({ value: String(n), label: fa(n) }))} />
        </FormField>
      </div>
    </div>
  );
}

function OptionsEditor({ value, onChange }: { value: { value: string; label: string }[]; onChange: (v: { value: string; label: string }[]) => void }) {
  const upd = (i: number, label: string) => onChange(value.map((o, j) => (j === i ? { ...o, label } : o)));
  const add = () => {
    let n = value.length + 1;
    while (value.some((o) => o.value === `opt${n}`)) n++;
    onChange([...value, { value: `opt${n}`, label: "" }]);
  };
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">گزینه‌ها</legend>
      <ol className="space-y-1.5">
        {value.map((o, i) => (
          <li key={o.value} className="flex items-center gap-1.5">
            <span className="w-5 text-center text-xs text-muted-foreground">{fa(i + 1)}</span>
            <Input value={o.label} placeholder={`گزینه‌ی ${fa(i + 1)}`} aria-label={`عنوان گزینه‌ی ${fa(i + 1)}`} onChange={(e) => upd(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            <Button variant="ghost" size="icon" aria-label={`حذف گزینه‌ی ${fa(i + 1)}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden /></Button>
          </li>
        ))}
      </ol>
      <Button size="sm" variant="outline" className="mt-2" onClick={add}><Plus className="size-4" aria-hidden /> گزینه</Button>
      <p className="mt-1 text-xs text-muted-foreground">با Enter گزینه‌ی بعدی اضافه می‌شود. برای فهرست‌های بلند از «فهرست پایه» استفاده کنید.</p>
    </fieldset>
  );
}

const COLUMN_TYPES: FieldType[] = ["text", "number", "amount", "date", "select", "lookup", "checkbox", "national_id", "mobile"];

function ColumnsEditor({ value, onChange, lookups }: { value: FieldDef[]; onChange: (v: FieldDef[]) => void; lookups: LookupType[] }) {
  const upd = (i: number, patch: Partial<FieldDef>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">ستون‌های جدول</legend>
      <ol className="space-y-2">
        {value.map((col, i) => (
          <li key={i} className={cn("space-y-1.5 rounded-field border-line border-border p-2")}>
            <div className="flex gap-1.5">
              <Input value={col.label} placeholder="عنوان ستون" aria-label={`عنوان ستون ${fa(i + 1)}`} onChange={(e) => upd(i, { label: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label={`حذف ستون ${fa(i + 1)}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={col.type} aria-label="نوع ستون" options={COLUMN_TYPES.map((t) => ({ value: t, label: catalogOf(t).title }))}
                onChange={(e) => upd(i, { type: e.target.value as FieldType, config: e.target.value === "select" ? { options: [{ value: "opt1", label: "گزینه‌ی ۱" }] } : {} })} />
              <label className="flex shrink-0 items-center gap-1.5 text-xs"><Switch checked={!!col.required} onCheckedChange={(v) => upd(i, { required: v })} aria-label="الزامی" /> الزامی</label>
            </div>
            {col.type === "lookup" && (
              <Select value={col.config?.lookup ?? ""} placeholder="فهرست پایه" aria-label="فهرست پایه" options={lookups.map((l) => ({ value: l.code, label: l.title }))}
                onChange={(e) => upd(i, { config: { lookup: e.target.value } })} />
            )}
            {col.type === "select" && <OptionsEditor value={col.config?.options ?? []} onChange={(options) => upd(i, { config: { options } })} />}
          </li>
        ))}
      </ol>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => {
        let n = value.length + 1;
        while (value.some((c) => c.key === `col${n}`)) n++;
        onChange([...value, { key: `col${n}`, type: "text", label: "" }]);
      }}><Plus className="size-4" aria-hidden /> ستون</Button>
    </fieldset>
  );
}
