/* eslint-disable @typescript-eslint/no-explicit-any */
// پنل خصوصیات فارسی فرایندساز. خروجی همچنان BPMN استاندارد با پسوندهای camunda است.
import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Badge } from "@/components/ui/badge";
import { cn, en, fa } from "@/lib/utils";
import type { FieldDef, FormSchema } from "@/core/forms/types";
import { dataFields } from "@/core/forms/types";
import { TYPE_FA } from "./translate";

export type Directory = {
  users: { id: number; username: string; full_name: string }[];
  units: { id: number; code: string; title: string; positions: { code: string; title: string; holder_name: string }[] }[];
  roles: { id: number; code: string; title: string }[];
};
export type ActionInfo = { code: string; title: string; description: string; inputs: { key: string; title: string }[]; outputs: { key: string; title: string }[] };
export type Outcome = { code: string; title: string; style: "primary" | "danger" | "default" };

type Ctx = { modeler: any; element: any; directory: Directory; actions: ActionInfo[]; schema: FormSchema | null; formTitle: string };

// ---------- ابزارهای خواندن/نوشتن camunda:properties ----------
function getProps(bo: any): Record<string, string> {
  const ext = bo.extensionElements?.values ?? [];
  const props = ext.find((v: any) => v.$type === "camunda:Properties");
  const out: Record<string, string> = {};
  (props?.values ?? []).forEach((p: any) => { out[p.name] = p.value; });
  return out;
}
function setProp(modeler: any, element: any, name: string, value: string | null) {
  const moddle = modeler.get("moddle");
  const bo = element.businessObject;
  const current = getProps(bo);
  if (value === null || value === "") delete current[name]; else current[name] = value;
  const others = (bo.extensionElements?.values ?? []).filter((v: any) => v.$type !== "camunda:Properties");
  const entries = Object.entries(current);
  const values = [...others];
  if (entries.length) {
    values.push(moddle.create("camunda:Properties", {
      values: entries.map(([n, v]) => moddle.create("camunda:Property", { name: n, value: v })),
    }));
  }
  modeler.get("modeling").updateProperties(element, {
    extensionElements: values.length ? moddle.create("bpmn:ExtensionElements", { values }) : undefined,
  });
}
function parseJson<T>(s: string | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

// ---------- پنل ----------
export function PropertiesPanel(props: Ctx & { processSettings: React.ReactNode }) {
  const { modeler, element } = props;
  const [, force] = React.useState(0);
  React.useEffect(() => {
    if (!modeler) return;
    const bus = modeler.get("eventBus");
    const h = () => force((x) => x + 1);
    bus.on("elements.changed", h);
    return () => bus.off("elements.changed", h);
  }, [modeler]);
  if (!modeler || !element) return null;
  const type: string = element.type;
  const bo = element.businessObject;
  const isRoot = type === "bpmn:Process" || type === "bpmn:Collaboration";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="text-xs font-medium text-brand">{TYPE_FA[type] ?? type.replace("bpmn:", "")}</div>
        <div className="truncate font-semibold">{bo.name || (isRoot ? "تنظیمات فرایند" : "بدون عنوان")}</div>
      </div>
      <div key={element.id} className="flex-1 space-y-5 overflow-y-auto p-4">
        {isRoot ? props.processSettings : <NameField {...props} />}
        {type === "bpmn:Task" && <ConvertTask {...props} />}
        {type === "bpmn:UserTask" && (
          <>
            <AssigneeField {...props} />
            <OutcomesField {...props} />
            <FieldAccess {...props} />
            <DueField {...props} />
            <DocField {...props} />
          </>
        )}
        {type === "bpmn:ServiceTask" && <ActionField {...props} />}
        {type === "bpmn:SequenceFlow" && bo.sourceRef?.$type?.includes("Gateway") && <ConditionField {...props} />}
        {type.includes("Gateway") && (
          <Alert>برای هر مسیر خروجی از این دروازه، روی خود پیکان کلیک کنید و «شرط عبور» را تعیین کنید.</Alert>
        )}
        {!isRoot && (
          <FormField label="شناسه‌ی فنی" htmlFor="el-id">
            <Input id="el-id" dir="ltr" value={element.id} readOnly />
          </FormField>
        )}
      </div>
    </div>
  );
}

function NameField({ modeler, element }: Ctx) {
  const bo = element.businessObject;
  const [v, setV] = React.useState(bo.name ?? "");
  React.useEffect(() => setV(bo.name ?? ""), [bo.name]);
  const commit = () => { if ((bo.name ?? "") !== v) modeler.get("modeling").updateLabel(element, v); };
  return (
    <FormField label="عنوان" htmlFor="el-name">
      <Input id="el-name" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </FormField>
  );
}

function ConvertTask({ modeler, element }: Ctx) {
  const replace = (type: string) => {
    const n = modeler.get("bpmnReplace").replaceElement(element, { type });
    modeler.get("selection").select(n);
  };
  return (
    <Alert variant="warning" title="این تسک خودکار رد می‌شود">
      اگر باید فردی آن را انجام دهد به «تسک کاربری» و اگر سامانه باید کاری انجام دهد به «اقدام سیستمی» تبدیلش کنید.
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => replace("bpmn:UserTask")}>تسک کاربری</Button>
        <Button size="sm" variant="outline" onClick={() => replace("bpmn:ServiceTask")}>اقدام سیستمی</Button>
      </div>
    </Alert>
  );
}

// ---------- انجام‌دهنده ----------
const KINDS = [
  { value: "initiator", label: "خود درخواست‌دهنده", needs: false },
  { value: "initiator_manager", label: "مدیر مستقیم درخواست‌دهنده", needs: false },
  { value: "user", label: "کاربر مشخص", needs: true },
  { value: "position", label: "متصدی سمت", needs: true },
  { value: "unit_manager", label: "مدیر واحد", needs: true },
  { value: "unit", label: "همه‌ی اعضای واحد", needs: true },
  { value: "role", label: "دارندگان نقش", needs: true },
];

export function useTokenLabel(directory: Directory) {
  return (token: string) => {
    const [kind, value] = token.includes(":") ? token.split(":") : [token, ""];
    const k = KINDS.find((x) => x.value === kind)?.label ?? kind;
    let name = value;
    if (kind === "user") name = directory.users.find((u) => u.username === value)?.full_name ?? value;
    if (kind === "position") name = directory.units.flatMap((u) => u.positions).find((p) => p.code === value)?.title ?? value;
    if (kind === "unit" || kind === "unit_manager") name = directory.units.find((u) => u.code === value)?.title ?? value;
    if (kind === "role") name = directory.roles.find((r) => r.code === value)?.title ?? value;
    return name ? `${k}: ${name}` : k;
  };
}

export function AssignmentBuilder({ value, onChange, directory, label, hint }: {
  value: string; onChange: (v: string) => void; directory: Directory; label: string; hint?: string;
}) {
  const tokens = value.split(",").map((t) => t.trim()).filter(Boolean);
  const [kind, setKind] = React.useState("initiator_manager");
  const [target, setTarget] = React.useState("");
  const labelOf = useTokenLabel(directory);
  const meta = KINDS.find((k) => k.value === kind)!;
  const targets = kind === "user" ? directory.users.map((u) => ({ value: u.username, label: u.full_name }))
    : kind === "position" ? directory.units.flatMap((u) => u.positions.map((p) => ({ value: p.code, label: `${p.title} (${u.title})` })))
    : kind === "role" ? directory.roles.map((r) => ({ value: r.code, label: r.title }))
    : directory.units.map((u) => ({ value: u.code, label: u.title }));
  const add = () => {
    const t = meta.needs ? `${kind}:${target}` : kind;
    if (meta.needs && !target) return;
    if (!tokens.includes(t)) onChange([...tokens, t].join(","));
    setTarget("");
  };
  return (
    <FormField label={label} required hint={hint}>
      <div className="space-y-2">
        {tokens.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {tokens.map((t) => (
              <li key={t} className="flex items-center gap-1 rounded-control bg-accent ps-2.5 text-xs">
                {labelOf(t)}
                <button type="button" aria-label="حذف" className="inline-flex size-8 items-center justify-center rounded-control hover:text-destructive"
                  onClick={() => onChange(tokens.filter((x) => x !== t).join(","))}><X className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-destructive">هنوز انجام‌دهنده‌ای تعیین نشده است.</p>}
        <Select value={kind} onChange={(e) => { setKind(e.target.value); setTarget(""); }} options={KINDS} aria-label="نوع انجام‌دهنده" />
        {meta.needs && <Select value={target} onChange={(e) => setTarget(e.target.value)} options={targets} placeholder="انتخاب کنید" aria-label="انتخاب" />}
        <Button size="sm" variant="outline" onClick={add} disabled={meta.needs && !target}><Plus className="size-4" /> افزودن</Button>
      </div>
    </FormField>
  );
}

function AssigneeField({ modeler, element, directory }: Ctx) {
  const v = element.businessObject.get("camunda:assignee") ?? "";
  return (
    <AssignmentBuilder value={v} directory={directory} label="انجام‌دهنده"
      hint="اگر چند مورد اضافه کنید، هر کدام از آن افراد می‌توانند کار را انجام دهند."
      onChange={(nv) => modeler.get("modeling").updateProperties(element, { "camunda:assignee": nv || undefined })} />
  );
}

// ---------- دکمه‌های اقدام ----------
const PRESETS: Outcome[][] = [
  [{ code: "approve", title: "تأیید", style: "primary" }, { code: "reject", title: "رد", style: "danger" }],
  [{ code: "approve", title: "تأیید", style: "primary" }, { code: "return", title: "بازگشت برای اصلاح", style: "default" }, { code: "reject", title: "رد", style: "danger" }],
  [{ code: "submit", title: "ارسال", style: "primary" }],
];

function OutcomesField({ modeler, element }: Ctx) {
  const outcomes = parseJson<Outcome[]>(getProps(element.businessObject).outcomes, []);
  const save = (next: Outcome[]) => setProp(modeler, element, "outcomes", next.length ? JSON.stringify(next) : null);
  const upd = (i: number, patch: Partial<Outcome>) => save(outcomes.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <FormField label="دکمه‌های اقدام" hint={`نتیجه در متغیر «${element.id}_outcome» ذخیره می‌شود و در شرط مسیرها قابل استفاده است.`}>
      <div className="space-y-2">
        {outcomes.map((o, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-field border-line border-border p-2">
            <Input value={o.title} onChange={(e) => upd(i, { title: e.target.value })} aria-label="عنوان دکمه" placeholder="عنوان" />
            <Input dir="ltr" value={o.code} onChange={(e) => upd(i, { code: e.target.value.replace(/[^a-z0-9_]/g, "") })} aria-label="کد" placeholder="code" />
            <Select value={o.style} onChange={(e) => upd(i, { style: e.target.value as Outcome["style"] })} aria-label="نوع"
              options={[{ value: "primary", label: "اصلی" }, { value: "default", label: "معمولی" }, { value: "danger", label: "منفی (قرمز)" }]} />
            <Button variant="ghost" size="sm" onClick={() => save(outcomes.filter((_, j) => j !== i))}><Trash2 className="size-4" /> حذف</Button>
          </div>
        ))}
        {!outcomes.length && (
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
              <Button key={i} size="sm" variant="outline" onClick={() => save(p)}>{p.map((o) => o.title).join(" / ")}</Button>
            ))}
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={() => save([...outcomes, { code: `action${outcomes.length + 1}`, title: "", style: "default" }])}>
          <Plus className="size-4" /> دکمه‌ی دلخواه
        </Button>
      </div>
    </FormField>
  );
}

// ---------- دسترسی فیلدها ----------
function FieldAccess({ modeler, element, schema, formTitle }: Ctx) {
  if (!schema) return <Alert variant="warning">برای تعیین فیلدهای هر مرحله، ابتدا در «تنظیمات فرایند» یک فرم انتخاب کنید.</Alert>;
  const access = parseJson<Record<string, string>>(getProps(element.businessObject).fieldAccess, {});
  const fields = dataFields(schema);
  const save = (next: Record<string, string>) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== "read"));
    setProp(modeler, element, "fieldAccess", Object.keys(clean).length ? JSON.stringify(clean) : null);
  };
  const setAll = (mode: string) => save(Object.fromEntries(fields.map((f) => [f.key, mode])));
  return (
    <FormField label={`فیلدهای فرم «${formTitle}» در این مرحله`} hint="پیش‌فرض «فقط‌خواندنی» است.">
      <div className="space-y-1">
        <div className="mb-2 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => setAll("edit")}>همه قابل‌ویرایش</Button>
          <Button size="sm" variant="ghost" onClick={() => setAll("read")}>همه فقط‌خواندنی</Button>
        </div>
        {fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-0">
            <span className="min-w-0 truncate text-sm">{f.label}</span>
            <SegmentedControl size="sm" value={access[f.key] ?? "read"} onChange={(v) => save({ ...access, [f.key]: v })}
              aria-label={`دسترسی ${f.label}`}
              options={[{ value: "edit", label: "ویرایش" }, { value: "read", label: "نمایش" }, { value: "hidden", label: "مخفی" }]} />
          </div>
        ))}
      </div>
    </FormField>
  );
}

function DueField({ modeler, element }: Ctx) {
  const v = getProps(element.businessObject).dueHours ?? "";
  return (
    <FormField label="مهلت انجام (ساعت)" htmlFor="due" hint="خالی یعنی بدون مهلت. کارهای دیرکرد در کارتابل مشخص می‌شوند.">
      <Input id="due" inputMode="numeric" value={fa(v)} onChange={(e) => setProp(modeler, element, "dueHours", en(e.target.value).replace(/\D/g, "") || null)} />
    </FormField>
  );
}

function DocField({ modeler, element }: Ctx) {
  const bo = element.businessObject;
  const cur = bo.documentation?.[0]?.text ?? "";
  const [v, setV] = React.useState(cur);
  const commit = () => {
    if (v === cur) return;
    const docs = v.trim() ? [modeler.get("moddle").create("bpmn:Documentation", { text: v })] : [];
    modeler.get("modeling").updateProperties(element, { documentation: docs });
  };
  return (
    <FormField label="راهنمای انجام کار" htmlFor="doc" hint="بالای فرم به کارپذیر نمایش داده می‌شود.">
      <Textarea id="doc" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} autoResize />
    </FormField>
  );
}

// ---------- اقدام سیستمی ----------
function ActionField({ modeler, element, actions, schema }: Ctx) {
  const code = getProps(element.businessObject).action ?? "";
  const a = actions.find((x) => x.code === code);
  const keys = new Set(schema ? dataFields(schema).map((f) => f.key) : []);
  return (
    <div className="space-y-3">
      <FormField label="اقدام" htmlFor="action" required>
        <Select id="action" value={code} placeholder="انتخاب اقدام" onChange={(e) => setProp(modeler, element, "action", e.target.value || null)}
          options={actions.map((x) => ({ value: x.code, label: x.title }))} />
      </FormField>
      {a && (
        <div className="space-y-3 rounded-field border-line border-border p-3 text-sm">
          <p className="text-muted-foreground">{a.description}</p>
          {a.inputs.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium">داده‌های لازم از فرم:</div>
              <ul className="space-y-1">
                {a.inputs.map((i) => (
                  <li key={i.key} className="flex items-center justify-between gap-2 text-xs">
                    <span>{i.title} <span dir="ltr" className="text-muted-foreground">({i.key})</span></span>
                    {keys.has(i.key) ? <Badge variant="success">در فرم هست</Badge> : <Badge variant="warning">در فرم نیست</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.outputs.length > 0 && (
            <div className="text-xs text-muted-foreground">خروجی: {a.outputs.map((o) => o.title).join("، ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- شرط مسیر ----------
type CondVar = { key: string; label: string; type: string; options?: { value: string; label: string }[] };
const OPS = [{ value: "==", label: "برابر با" }, { value: "!=", label: "مخالف" }, { value: ">", label: "بیشتر از" },
  { value: ">=", label: "بیشتر یا مساوی" }, { value: "<", label: "کمتر از" }, { value: "<=", label: "کمتر یا مساوی" }];

function conditionVars(modeler: any, schema: FormSchema | null): CondVar[] {
  const vars: CondVar[] = [];
  modeler.get("elementRegistry").filter((e: any) => e.type === "bpmn:UserTask").forEach((e: any) => {
    const outs = parseJson<Outcome[]>(getProps(e.businessObject).outcomes, []);
    if (outs.length) vars.push({ key: `${e.id}_outcome`, label: `نتیجه‌ی «${e.businessObject.name || e.id}»`, type: "select",
      options: outs.map((o) => ({ value: o.code, label: o.title })) });
  });
  (schema ? dataFields(schema) : []).forEach((f: FieldDef) => {
    if (["table", "file", "address", "multiselect", "multilookup"].includes(f.type)) return;
    vars.push({ key: f.key, label: f.label, type: f.type, options: f.config?.options });
  });
  return vars;
}

function ConditionField({ modeler, element, schema }: Ctx) {
  const bo = element.businessObject;
  const cur: string = bo.conditionExpression?.body ?? "";
  const vars = conditionVars(modeler, schema);
  const m = /^\s*(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/.exec(cur);
  const parsed = m ? { key: m[1], op: m[2], value: m[3].replace(/^["']|["']$/g, "") } : null;
  const [advanced, setAdvanced] = React.useState(!!cur && (!parsed || !vars.some((v) => v.key === parsed.key)));
  const [raw, setRaw] = React.useState(cur);
  const write = (expr: string) => {
    const moddle = modeler.get("moddle");
    modeler.get("modeling").updateProperties(element, {
      conditionExpression: expr ? moddle.create("bpmn:FormalExpression", { body: expr }) : undefined,
    });
    setRaw(expr);
  };
  const st = parsed ?? { key: "", op: "==", value: "" };
  const v = vars.find((x) => x.key === st.key);
  const build = (p: { key: string; op: string; value: string }) => {
    const vv = vars.find((x) => x.key === p.key);
    if (!vv) return write("");
    let val = p.value;
    if (["number", "amount"].includes(vv.type)) val = String(Number(en(val || "0")) || 0);
    else if (vv.type === "checkbox") val = val === "True" ? "True" : "False";
    else val = JSON.stringify(val);
    write(`${p.key} ${p.op} ${val}`);
  };
  return (
    <FormField label="شرط عبور از این مسیر" hint={cur ? undefined : "بدون شرط: اگر شرط‌های دیگر برقرار نباشند، این مسیر انتخاب نمی‌شود."}>
      <div className="space-y-2">
        {!advanced ? (
          <>
            <Select value={st.key} placeholder="بدون شرط" aria-label="متغیر"
              options={vars.map((x) => ({ value: x.key, label: x.label }))}
              onChange={(e) => {
                const nv = vars.find((x) => x.key === e.target.value);
                build({ key: e.target.value, op: "==", value: nv?.options?.[0]?.value ?? (nv?.type === "checkbox" ? "True" : "") });
              }} />
            {v && (
              <>
                <Select value={st.op} aria-label="عملگر" onChange={(e) => build({ ...st, op: e.target.value })}
                  options={["number", "amount"].includes(v.type) ? OPS : OPS.slice(0, 2)} />
                {v.options ? (
                  <Select value={st.value} aria-label="مقدار" onChange={(e) => build({ ...st, value: e.target.value })} options={v.options} />
                ) : v.type === "checkbox" ? (
                  <Select value={st.value} aria-label="مقدار" onChange={(e) => build({ ...st, value: e.target.value })}
                    options={[{ value: "True", label: "بله" }, { value: "False", label: "خیر" }]} />
                ) : (
                  <Input defaultValue={st.value} aria-label="مقدار" onBlur={(e) => build({ ...st, value: e.target.value })} />
                )}
              </>
            )}
          </>
        ) : (
          <Input dir="ltr" value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={() => write(raw.trim())}
            placeholder='days > 3 and leave_type == "estelaji"' aria-label="عبارت شرط" />
        )}
        <Button variant="ghost" size="sm" onClick={() => setAdvanced(!advanced)}>{advanced ? "حالت ساده" : "حالت پیشرفته (عبارت دلخواه)"}</Button>
        {raw && <code dir="ltr" className={cn("block rounded-field bg-muted px-2 py-1 text-xs")}>{raw}</code>}
      </div>
    </FormField>
  );
}

