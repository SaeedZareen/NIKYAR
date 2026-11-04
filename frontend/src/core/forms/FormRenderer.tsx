// نمایش‌دهنده‌ی فرم: هر فرمی که در فرم‌ساز طراحی شده را رسم می‌کند.
// در کارتابل، پیش‌نمایش فرم‌ساز و فیلدهای سفارشی پرونده‌ی پرسنلی استفاده می‌شود.
import * as React from "react";
import { Download, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup } from "@/components/ui/radio-group";
import { MultiSelect } from "@/components/ui/multi-select";
import { AmountInput } from "@/components/ui/amount-input";
import { TimePicker } from "@/components/ui/time-picker";
import { NationalIdInput } from "@/components/ui/national-id-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { IbanInput } from "@/components/ui/iban-input";
import { CardNumberInput } from "@/components/ui/card-number-input";
import { PostalCodeInput } from "@/components/ui/postal-code-input";
import { AddressPicker } from "@/components/ui/address-picker";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { cn, en, fa, faFileSize, formatToman } from "@/lib/utils";
import { get, uploadFile, type Attachment } from "@/app/api";
import { ErrorSummary, JalaliDateInput, useApiAction } from "@/app/ui";
import { DISPLAY_ONLY, isVisible, lookupCodes, type Access, type FieldDef, type FormSchema, type Values } from "./types";
import { useLookupBundle, useUnits, useUsersBrief, type LookupOption } from "./useFormRefs";

type Refs = {
  lookups: Record<string, LookupOption[]>;
  users: { id: number; full_name: string }[];
  units: { id: number; title: string }[];
};
const RefsCtx = React.createContext<Refs>({ lookups: {}, users: [], units: [] });

// ستون‌ها بر اساس عرض واقعی: روی لپ‌تاپ حداکثر ۲ ستون، روی نمایشگر بزرگ تا ۳/۴ ستون
const GRID: Record<number, string> = { 1: "", 2: "lg:grid-cols-2", 3: "lg:grid-cols-2 2xl:grid-cols-3", 4: "lg:grid-cols-2 2xl:grid-cols-4" };
const SPAN: Record<number, string> = { 1: "", 2: "lg:col-span-2", 3: "lg:col-span-2 2xl:col-span-3", 4: "lg:col-span-2 2xl:col-span-4" };

export interface FormRendererProps {
  schema: FormSchema;
  values: Values;
  onChange?: (values: Values) => void;
  errors?: Record<string, string>;
  access?: Access;          // دسترسی هر فیلد در این مرحله؛ پیش‌فرض: defaultMode
  defaultMode?: "edit" | "read";
  readOnly?: boolean;
  /** خلاصه‌ی خطاها بالای فرم پس از ارسال ناموفق (پیش‌فرض: روشن) */
  summary?: boolean;
}

export function labelsOf(schema: FormSchema): Record<string, string> {
  return Object.fromEntries(schema.sections.flatMap((s) => s.fields.map((f) => [f.key, f.label])));
}

function useRefs(schema: FormSchema): Refs {
  const fields = schema.sections.flatMap((s) => s.fields);
  const lookups = useLookupBundle(lookupCodes(schema));
  const users = useUsersBrief(hasType(fields, "user"));
  const units = useUnits(hasType(fields, "org_unit"));
  return { lookups: lookups.data ?? {}, users: users.data ?? [], units: units.data ?? [] };
}

/** داده‌ی مرجع فیلدها (فهرست‌های پایه، کاربران، واحدها) برای پیش‌نمایش فیلد بیرون از FormRenderer */
export function FormRefsProvider({ schema, children }: { schema: FormSchema; children: React.ReactNode }) {
  return <RefsCtx.Provider value={useRefs(schema)}>{children}</RefsCtx.Provider>;
}

export function FormRenderer({ schema, values, onChange, errors = {}, access = {}, defaultMode = "edit", readOnly, summary = true }: FormRendererProps) {
  const refs = useRefs(schema);
  const modeOf = (f: FieldDef) => (readOnly ? "read" : access[f.key] ?? defaultMode);
  const set = (key: string, v: unknown) => onChange?.({ ...values, [key]: v });

  return (
    <RefsCtx.Provider value={refs}>
      {summary && !readOnly && <ErrorSummary errors={errors} labels={labelsOf(schema)} />}
      <div className="space-y-5">
        {schema.sections.map((s) => {
          const visible = s.fields.filter((f) => isVisible(f, values) && (DISPLAY_ONLY.includes(f.type) || modeOf(f) !== "hidden"));
          if (!visible.length) return null;
          const cols = Math.min(Math.max(s.columns ?? 2, 1), 4);
          return (
            <fieldset key={s.id} className="min-w-0">
              {s.title && <legend className="mb-2 w-full border-b border-border pb-1 text-sm font-bold text-brand">{s.title}</legend>}
              {s.description && <p className="mb-2 text-sm text-muted-foreground">{s.description}</p>}
              <div className={cn("grid grid-cols-1 gap-x-8 gap-y-2.5", GRID[cols])}>
                {visible.map((f) => (
                  <div key={f.key || f.label} className={cn(SPAN[Math.min(f.span ?? 1, cols)])}>
                    <FieldBlock field={f} value={values[f.key]} mode={modeOf(f)} error={errors[f.key]}
                      rowErrors={errors} onChange={(v) => set(f.key, v)} />
                  </div>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </RefsCtx.Provider>
  );
}

function hasType(fields: FieldDef[], t: string): boolean {
  return fields.some((f) => f.type === t || (f.columns && hasType(f.columns, t)));
}

/** چیدمان فیلد به سبک راهکاران: برچسب در راست و کنترل در همان ردیف (روی موبایل زیر هم) */
export function FieldRow({ label, labelFor, labelId, required, children, hint, error }: {
  label: React.ReactNode; labelFor?: string; labelId?: string; required?: boolean; children: React.ReactNode; hint?: string; error?: string;
}) {
  const msgId = labelFor ? `${labelFor}-msg` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-start md:gap-3">
      {labelFor
        ? <label htmlFor={labelFor} id={labelId} className="text-sm font-medium md:w-32 md:shrink-0 md:pt-2">{label}{required && <span className="ms-1 text-destructive" aria-hidden>*</span>}{required && <span className="sr-only"> (الزامی)</span>}</label>
        : <div id={labelId} className="text-sm text-muted-foreground md:w-32 md:shrink-0 md:pt-0.5">{label}</div>}
      <div className="min-w-0 flex-1">
        {children}
        {(error || hint) && <p id={msgId} role={error ? "alert" : undefined} className={cn("mt-1 text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? hint}</p>}
      </div>
    </div>
  );
}

function FieldBlock({ field: f, value, mode, error, rowErrors, onChange }: {
  field: FieldDef; value: unknown; mode: string; error?: string; rowErrors: Record<string, string>; onChange: (v: unknown) => void;
}) {
  if (f.type === "heading") return <h3 className="pt-1 text-sm font-bold">{f.label}</h3>;
  if (f.type === "paragraph") return <p className="text-sm text-muted-foreground">{f.label}</p>;
  const id = `f-${f.key}`;
  const editable = mode === "edit" && !f.readonly;
  if (!editable) {
    // حالت فقط‌خواندنی: برچسب و مقدار، نه فیلد خاکستری شبیه غیرفعال (read-only-distinction)
    return (
      <div role="group" aria-labelledby={`${id}-label`} className="border-b border-dashed border-border pb-1.5">
        <FieldRow label={f.label} labelId={`${id}-label`}>
          <div className="break-words text-sm font-medium"><FieldDisplay field={f} value={value} /></div>
        </FieldRow>
      </div>
    );
  }
  if (f.type === "checkbox") {
    return (
      <FieldRow label="" error={error} hint={f.help}>
        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
          <Switch id={id} checked={!!value} onCheckedChange={onChange} aria-label={f.label} />
          <span>{f.label}{f.required && <span className="ms-1 text-destructive">*</span>}</span>
        </label>
      </FieldRow>
    );
  }
  return (
    <FieldRow label={f.label} labelFor={id} required={f.required} error={error} hint={f.help}>
      <FieldControl id={id} field={f} value={value} onChange={onChange} invalid={!!error} rowErrors={rowErrors} />
    </FieldRow>
  );
}

export function FieldControl({ id, field: f, value, onChange, invalid, rowErrors = {}, compact }: {
  id?: string; field: FieldDef; value: unknown; onChange: (v: unknown) => void; invalid?: boolean;
  rowErrors?: Record<string, string>; compact?: boolean;
}) {
  const refs = React.useContext(RefsCtx);
  const c = f.config ?? {};
  const str = (value ?? "") as string;
  switch (f.type) {
    case "text":
      return <Input id={id} value={str} placeholder={f.placeholder} maxLength={num(c.maxLength)} aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)} />;
    case "password":
      return <Input id={id} dir="ltr" type="password" autoComplete="new-password" value={str} aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)} />;
    case "textarea":
      return <Textarea id={id} value={str} placeholder={f.placeholder} maxLength={num(c.maxLength)} showCount={!!c.maxLength}
        autoResize aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <Input id={id} inputMode="decimal" value={value === null || value === undefined ? "" : fa(String(value))}
        aria-invalid={invalid} onChange={(e) => onChange(en(e.target.value).replace(/[^\d.-]/g, ""))} />;
    case "amount":
      return <AmountInput id={id} value={(value as number) ?? null} onChange={onChange} min={num(c.min)} max={num(c.max)} words={!compact} />;
    case "checkbox":
      return <Switch checked={!!value} onCheckedChange={onChange} aria-label={f.label} />;
    case "select": {
      const opts = c.options ?? [];
      if (opts.length <= 3 && !compact) return <RadioGroup options={opts} value={str} onChange={onChange} name={id} />;
      return <Select id={id} options={opts} value={str} placeholder="انتخاب کنید" onChange={(e) => onChange(e.target.value)} />;
    }
    case "multiselect":
      return <MultiSelect options={c.options ?? []} value={(value as string[]) ?? []} onChange={onChange} searchable />;
    case "lookup": {
      const items = (refs.lookups[c.lookup ?? ""] ?? []).filter((i) => i.is_active || i.code === str);
      return <Select id={id} value={str} placeholder="انتخاب کنید" onChange={(e) => onChange(e.target.value)}
        options={items.map((i) => ({ value: i.code, label: i.title }))} />;
    }
    case "multilookup": {
      const items = (refs.lookups[c.lookup ?? ""] ?? []).filter((i) => i.is_active);
      return <MultiSelect options={items.map((i) => ({ value: i.code, label: i.title }))} value={(value as string[]) ?? []} onChange={onChange} searchable />;
    }
    case "date":
      return <JalaliDateInput id={id} value={str} onChange={onChange} />;
    case "time":
      return <TimePicker id={id} value={str || null} onChange={onChange} />;
    case "national_id":
      return <NationalIdInput id={id} value={str} onChange={(d) => onChange(d)} />;
    case "mobile":
      return <PhoneInput id={id} value={str} onChange={(d) => onChange(d)} />;
    case "phone":
      return <Input id={id} dir="ltr" inputMode="tel" value={str} placeholder="۰۲۱۱۲۳۴۵۶۷۸" onChange={(e) => onChange(en(e.target.value).replace(/\D/g, ""))} />;
    case "email":
      return <Input id={id} dir="ltr" type="email" value={str} onChange={(e) => onChange(e.target.value)} />;
    case "iban":
      return <IbanInput id={id} value={str} onChange={(v) => onChange(v)} />;
    case "card_number":
      return <CardNumberInput id={id} value={str} onChange={(d) => onChange(d)} />;
    case "postal_code":
      return <PostalCodeInput id={id} value={str} invalid={invalid} onChange={(d) => onChange(d)} />;
    case "address":
      return <AddressPicker id={id} value={(value as { province: string; city: string }) ?? { province: "", city: "" }} invalid={invalid}
        onChange={(v) => onChange(v)} layout={compact ? "stack" : "row"} />;
    case "user":
      return <Select id={id} value={String(value ?? "")} placeholder="انتخاب کاربر"
        options={refs.users.map((u) => ({ value: String(u.id), label: u.full_name }))} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} />;
    case "org_unit":
      return <Select id={id} value={String(value ?? "")} placeholder="انتخاب واحد"
        options={refs.units.map((u) => ({ value: String(u.id), label: u.title }))} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} />;
    case "file":
      return <FileField value={(value as number[]) ?? []} onChange={onChange} max={num(c.maxFiles)} />;
    case "table":
      return <TableField field={f} value={(value as Values[]) ?? []} onChange={onChange} errors={rowErrors} />;
    default:
      return null;
  }
}

function num(v: unknown): number | undefined {
  return v === undefined || v === null || v === "" ? undefined : Number(v);
}

export function displayText(f: FieldDef, value: unknown, refs: Refs): string {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "—";
  const c = f.config ?? {};
  switch (f.type) {
    case "checkbox": return value ? "بله" : "خیر";
    case "password": return "••••••••";
    case "amount": return formatToman(Number(value));
    case "select": return c.options?.find((o) => o.value === value)?.label ?? String(value);
    case "multiselect": return (value as string[]).map((v) => c.options?.find((o) => o.value === v)?.label ?? v).join("، ");
    case "lookup": return refs.lookups[c.lookup ?? ""]?.find((i) => i.code === value)?.title ?? String(value);
    case "multilookup": return (value as string[]).map((v) => refs.lookups[c.lookup ?? ""]?.find((i) => i.code === v)?.title ?? v).join("، ");
    case "user": return refs.users.find((u) => u.id === Number(value))?.full_name ?? String(value);
    case "org_unit": return refs.units.find((u) => u.id === Number(value))?.title ?? String(value);
    case "address": { const a = value as { province: string; city: string }; return [a.province, a.city].filter(Boolean).join("، "); }
    default: return fa(String(value));
  }
}

function FieldDisplay({ field: f, value }: { field: FieldDef; value: unknown }) {
  const refs = React.useContext(RefsCtx);
  if (f.type === "file") return <FileList ids={(value as number[]) ?? []} />;
  if (f.type === "table") return <TableField field={f} value={(value as Values[]) ?? []} readOnly />;
  const ltr = ["iban", "card_number", "email", "mobile", "phone", "national_id", "postal_code"].includes(f.type);
  const text = displayText(f, value, refs);
  if (text === "—") return <span className="font-normal text-muted-foreground">ثبت نشده</span>;
  return ltr ? <bdi dir="ltr">{text}</bdi> : <span className="whitespace-pre-wrap">{text}</span>;
}

function FileField({ value, onChange, max }: { value: number[]; onChange: (v: unknown) => void; max?: number }) {
  const run = useApiAction();
  const [busy, setBusy] = React.useState(false);
  const onFiles = async (files: File[]) => {
    setBusy(true);
    const ids = [...value];
    for (const file of files) {
      if (max && ids.length >= max) break;
      const r = await run(() => uploadFile(file));
      if (r.ok && r.data) ids.push(r.data.id);
    }
    setBusy(false);
    onChange(ids);
  };
  return (
    <div className="space-y-3">
      {(!max || value.length < max) && (
        <FileUpload onFiles={onFiles} multiple={!max || max > 1} maxSize={20 * 1024 * 1024}
          hint={busy ? "در حال بارگذاری…" : `حداکثر ۲۰ مگابایت${max ? ` · حداکثر ${fa(max)} فایل` : ""}`} />
      )}
      <FileList ids={value} onRemove={(id) => onChange(value.filter((x) => x !== id))} />
    </div>
  );
}

export function FileList({ ids, onRemove }: { ids: number[]; onRemove?: (id: number) => void }) {
  const q = useQuery({
    queryKey: ["files-meta", ids.join(",")], enabled: ids.length > 0,
    queryFn: () => get<Attachment[]>(`/files/meta/?ids=${ids.join(",")}`),
  });
  if (!ids.length) return onRemove ? null : <span className="font-normal text-muted-foreground">بدون پیوست</span>;
  return (
    <ul className="space-y-2">
      {(q.data ?? []).map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 rounded-field border-line border-border px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{a.name}</span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-xs text-muted-foreground">{faFileSize(a.size)}</span>
            <a href={`${a.url}?download=1`} className="inline-flex size-10 items-center justify-center rounded-control hover:bg-accent" aria-label={`دریافت ${a.name}`}>
              <Download className="size-4" />
            </a>
            {onRemove && (
              <button type="button" onClick={() => onRemove(a.id)} aria-label={`حذف ${a.name}`}
                className="inline-flex size-10 items-center justify-center rounded-control text-destructive hover:bg-destructive/10">
                <X className="size-4" />
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TableField({ field: f, value, onChange, errors = {}, readOnly }: {
  field: FieldDef; value: Values[]; onChange?: (v: unknown) => void; errors?: Record<string, string>; readOnly?: boolean;
}) {
  const refs = React.useContext(RefsCtx);
  const cols = f.columns ?? [];
  const setCell = (i: number, key: string, v: unknown) => onChange?.(value.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-field border-line border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2 text-start font-medium">ردیف</th>
              {cols.map((c) => <th key={c.key} className="px-2 py-2 text-start font-medium">{c.label}{!readOnly && c.required && <span className="ms-1 text-destructive">*</span>}</th>)}
              {!readOnly && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {value.length === 0 && (
              <tr><td colSpan={cols.length + 2} className="px-3 py-4 text-center text-muted-foreground">ردیفی ثبت نشده است.</td></tr>
            )}
            {value.map((row, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="px-2 py-2 text-muted-foreground">{fa(i + 1)}</td>
                {cols.map((c) => {
                  const err = errors[`${f.key}.${i}.${c.key}`];
                  return (
                    <td key={c.key} className="min-w-40 px-2 py-2">
                      {readOnly ? displayText(c, row[c.key], refs) : (
                        <>
                          <FieldControl field={c} value={row[c.key]} onChange={(v) => setCell(i, c.key, v)} invalid={!!err} compact />
                          {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
                        </>
                      )}
                    </td>
                  );
                })}
                {!readOnly && (
                  <td className="px-1 py-2">
                    <Button variant="ghost" size="icon" aria-label={`حذف ردیف ${fa(i + 1)}`} onClick={() => onChange?.(value.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <Button variant="outline" size="sm" onClick={() => onChange?.([...value, {}])}>
          <Plus className="size-4" /> افزودن ردیف
        </Button>
      )}
    </div>
  );
}
