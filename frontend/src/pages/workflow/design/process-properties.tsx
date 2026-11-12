import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { useRoleOptions } from "@/app/forms"
import { isDisplay, itemsOf, type FieldDef, type FormDefinition } from "@/components/form-renderer/definition"
import { usePositionNames, useUnitOptions, useUserNames } from "@/components/form-renderer/org-options"
import { InfoTip } from "@/components/info-tip"
import { SearchPicker } from "@/components/search-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { UserPicker } from "@/components/user-picker"
import { ConditionEditor } from "@/pages/forms/design/rule-editors"
import { decisionsBefore, DEFAULT_DECISIONS, infoOf, setCondition, setDefault, setName, setProps, userTasks } from "./bpmn-props"
import { conditionPython } from "./condition-python"

type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Decision = { value: string; label: string; comment?: "required" | "optional" }
type Rule = { type: string; [key: string]: unknown }
export type ActionType = { code: string; title: string }

const ASSIGNEES: Record<string, string> = {
  requester: "خود درخواست‌دهنده",
  requester_manager: "مدیر مستقیم درخواست‌دهنده",
  actor_manager: "مدیر مستقیم انجام‌دهنده‌ی یک مرحله‌ی قبلی",
  unit_manager: "مدیر یک واحد",
  position: "صاحب یک سمت",
  role: "دارندگان یک نقش",
  user: "کاربر مشخص",
  field: "کاربر انتخاب‌شده در فرم",
}
const ACCESS = { hidden: "پنهان", readonly: "فقط‌خواندنی", edit: "قابل ویرایش", required: "الزامی" } as const
const TYPE_TITLES: Record<string, string> = {
  "bpmn:StartEvent": "رویداد شروع",
  "bpmn:EndEvent": "رویداد پایان",
  "bpmn:UserTask": "کار کاربری",
  "bpmn:ServiceTask": "اقدام خودکار",
  "bpmn:ExclusiveGateway": "دروازه‌ی شرطی",
  "bpmn:ParallelGateway": "دروازه‌ی موازی",
  "bpmn:SequenceFlow": "مسیر",
}
/** فیلدهای ساده‌ای که «تنظیم مقدار فیلد» می‌پذیرد (هم‌سو با SETTABLE در core/workflow/actions.py). */
const SETTABLE = new Set(["text", "textarea", "number", "amount", "date", "boolean", "choice", "lookup", "hidden"])

type Props = {
  modeler: Any
  id: string | null
  definition: FormDefinition
  actions: ActionType[]
  problem?: string
}

/** پانل ویژگی‌های عنصر انتخاب‌شده‌ی بوم؛ هر تغییر یک فرمان bpmn-js است (واگرد و ذخیره‌ی خودکار). */
export function ElementProperties({ modeler, id, definition, actions, problem }: Props) {
  const element = id ? modeler.get("elementRegistry").get(id) : null
  if (!element || element.type === "bpmn:Process" || element.type === "label") {
    return <p className="text-xs text-muted-foreground">روی یک مرحله، دروازه یا مسیر بزنید تا ویژگی‌هایش این‌جا بیاید.</p>
  }
  const info = infoOf(element)
  const write = (patch: Record<string, unknown>) => setProps(modeler, element, patch)
  const fields = definition.sections.flatMap((s) => s.fields).filter((f) => !isDisplay(f))
  return (
    <div className="flex flex-col gap-3" key={info.id}>
      <p className="text-xs font-semibold">{TYPE_TITLES[info.type] ?? "عنصر"}</p>
      {problem && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {problem}
        </p>
      )}
      <Row id={`${info.id}-name`} label="عنوان">
        <CommitInput id={`${info.id}-name`} value={info.name} onCommit={(v) => setName(modeler, element, v.trim())} />
      </Row>
      {info.type === "bpmn:UserTask" && (
        <>
          <Row id={`${info.id}-assignee`} label="گیرنده" help="چه کسی این مرحله را انجام می‌دهد؛ از ساختار سازمانی حساب می‌شود. اگر به کسی نرسد، کار به مدیران فرایند می‌رسد.">
            <AssigneeEditor id={`${info.id}-assignee`} value={info.props.assignee as Rule | undefined} onChange={(assignee) => write({ assignee })} fields={fields} tasks={userTasks(modeler).filter((t) => t.id !== info.id)} />
          </Row>
          <DecisionsEditor id={`${info.id}-decisions`} value={(info.props.decisions as Decision[] | undefined) ?? [...DEFAULT_DECISIONS]} onChange={(decisions) => write({ decisions })} />
          <Field orientation="horizontal">
            <Switch id={`${info.id}-skip`} checked={info.props.skip_same === true} onCheckedChange={(on) => write({ skip_same: on || undefined })} />
            <FieldLabel htmlFor={`${info.id}-skip`}>اگر گیرنده همان انجام‌دهنده‌ی مرحله‌ی قبل است، خودکار تأیید شود</FieldLabel>
          </Field>
          <AccessEditor id={`${info.id}-access`} fields={fields} value={(info.props.fields as Record<string, string> | undefined) ?? {}} onChange={(access) => write({ fields: Object.keys(access).length ? access : undefined })} />
        </>
      )}
      {info.type === "bpmn:ServiceTask" && (
        <ActionEditor id={`${info.id}-action`} actions={actions} fields={fields} tasks={userTasks(modeler)} value={info.props.action as Rule | undefined} onChange={(action) => write({ action })} />
      )}
      {info.type === "bpmn:EndEvent" && (
        <Row id={`${info.id}-outcome`} label="نتیجه‌ی درخواست">
          <Pick id={`${info.id}-outcome`} value={(info.props.outcome as string) ?? "completed"} onChange={(v) => write({ outcome: v === "completed" ? undefined : v })} options={{ completed: "انجام شد", rejected: "رد شد" }} />
        </Row>
      )}
      {info.type === "bpmn:ExclusiveGateway" && <p className="text-2xs text-muted-foreground">شرط هر مسیر خروجی را روی خود مسیر بگذارید و یکی را «مسیر پیش‌فرض» کنید تا درخواست هیچ‌وقت گیر نکند.</p>}
      {info.type === "bpmn:SequenceFlow" && <FlowEditor modeler={modeler} element={element} info={info} definition={definition} />}
    </div>
  )
}

function Row({ id, label, help, error, children }: { id: string; label: string; help?: string; error?: string; children: React.ReactNode }) {
  return (
    <Field data-invalid={!!error}>
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {help && <InfoTip label={`راهنمای ${label}`}>{help}</InfoTip>}
      </div>
      {children}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

/** متن با ذخیره هنگام ترک فیلد یا Enter (یک قدم واگرد برای هر ویرایش). */
function CommitInput({ id, value, onCommit, dir, multiline, ...aria }: { id: string; value: string; onCommit: (v: string) => void; dir?: "ltr"; multiline?: boolean; "aria-label"?: string }) {
  const [draft, setDraft] = React.useState(value)
  const [editing, setEditing] = React.useState(false)
  if (!editing && draft !== value) setDraft(value)
  const commit = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }
  const common = { id, value: draft, dir, onFocus: () => setEditing(true), onBlur: commit, ...aria }
  return multiline ? (
    <Textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <Input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
  )
}

function Pick({ id, value, onChange, options, placeholder, ...aria }: { id: string; value: string; onChange: (v: string) => void; options: Record<string, string>; placeholder?: string; "aria-label"?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder={placeholder ?? "انتخاب کنید"} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AssigneeEditor({ id, value, onChange, fields, tasks }: { id: string; value?: Rule; onChange: (r: Rule) => void; fields: FieldDef[]; tasks: { id: string; name: string }[] }) {
  const units = useUnitOptions()
  const positions = usePositionNames() ?? []
  const roles = useRoleOptions()
  const userId = value?.type === "user" ? Number(value.user) : 0
  const userName = useUserNames(userId ? [userId] : []).data?.[0]?.full_name ?? ""
  const kind = value?.type ?? ""
  const set = (patch: Record<string, unknown>) => onChange({ type: kind, ...patch })
  return (
    <div className="flex flex-col gap-2">
      <Pick id={id} value={kind} onChange={(type) => onChange({ type })} options={ASSIGNEES} placeholder="گیرنده را انتخاب کنید" />
      {kind === "actor_manager" && (
        <SearchPicker aria-label="مرحله‌ی قبلی" options={tasks.map((t) => ({ value: t.id, label: t.name }))} value={String(value?.element ?? "")} onChange={(v) => set({ element: v })} placeholder="کدام مرحله" />
      )}
      {kind === "unit_manager" && <SearchPicker aria-label="واحد" options={units} value={String(value?.unit ?? "")} onChange={(v) => set({ unit: Number(v) })} placeholder="انتخاب واحد" />}
      {kind === "position" && (
        <SearchPicker aria-label="سمت" options={positions.map((p) => ({ value: String(p.id), label: p.title }))} value={String(value?.position ?? "")} onChange={(v) => set({ position: Number(v) })} placeholder="انتخاب سمت" />
      )}
      {kind === "role" && (
        <>
          <SearchPicker aria-label="نقش" options={roles} value={String(value?.role ?? "")} onChange={(v) => set({ role: Number(v), same_unit: value?.same_unit === true })} placeholder="انتخاب نقش" />
          <Field orientation="horizontal">
            <Checkbox id={`${id}-unit`} checked={value?.same_unit === true} onCheckedChange={(on) => set({ role: value?.role, same_unit: on === true })} />
            <FieldLabel htmlFor={`${id}-unit`}>فقط در واحد درخواست‌دهنده و زیرواحدهایش</FieldLabel>
          </Field>
        </>
      )}
      {kind === "user" && <UserPicker aria-label="کاربر" value={userId ? { id: userId, name: userName } : null} onChange={(u) => u && set({ user: u.id })} />}
      {kind === "field" && (
        <SearchPicker
          aria-label="فیلد کاربر"
          options={fields.filter((f) => f.type === "user").map((f) => ({ value: f.id, label: f.label ?? f.id }))}
          value={String(value?.field ?? "")}
          onChange={(v) => set({ field: v })}
          placeholder="فیلد «کاربر» فرم"
          emptyText="فرم اصلی فیلد «کاربر» ندارد."
        />
      )}
    </div>
  )
}

function DecisionsEditor({ id, value, onChange }: { id: string; value: Decision[]; onChange: (d: Decision[]) => void }) {
  const update = (i: number, patch: Partial<Decision>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex items-center gap-1 text-xs font-medium">
        دکمه‌های تصمیم
        <InfoTip label="راهنمای دکمه‌های تصمیم">هر دکمه یک تصمیم است؛ «کد» لاتین آن در شرط مسیرهای بعد به کار می‌رود (مثلاً approve). برای «رد» یا «بازگشت برای اصلاح» یادداشت را الزامی کنید.</InfoTip>
      </legend>
      {value.map((d, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-md border p-2">
          <div className="flex gap-1.5">
            <CommitInput id={`${id}-${i}-label`} aria-label={`عنوان تصمیم ${i + 1}`} value={d.label} onCommit={(label) => update(i, { label })} />
            <div className="w-28 shrink-0">
              <CommitInput id={`${id}-${i}-value`} aria-label={`کد تصمیم ${i + 1}`} dir="ltr" value={d.value} onCommit={(v) => update(i, { value: v.trim().toLowerCase() })} />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`حذف تصمیم ${i + 1}`} disabled={value.length === 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
          <Field orientation="horizontal">
            <Checkbox id={`${id}-${i}-comment`} checked={d.comment === "required"} onCheckedChange={(on) => update(i, { comment: on === true ? "required" : undefined })} />
            <FieldLabel htmlFor={`${id}-${i}-comment`}>یادداشت الزامی</FieldLabel>
          </Field>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...value, { value: `choice${value.length + 1}`, label: "تصمیم تازه" }])}>
        <Plus /> افزودن تصمیم
      </Button>
    </fieldset>
  )
}

function AccessEditor({ id, fields, value, onChange }: { id: string; fields: FieldDef[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 flex items-center gap-1 text-xs font-medium">
        فیلدهای فرم در این مرحله
        <InfoTip label="راهنمای فیلدهای فرم در این مرحله">گیرنده‌ی این مرحله هر فیلد را پنهان، فقط‌خواندنی، قابل ویرایش یا الزامی می‌بیند. پیش‌فرض فقط‌خواندنی است.</InfoTip>
      </legend>
      {fields.length === 0 && <p className="text-2xs text-muted-foreground">فرم اصلی فیلدی ندارد.</p>}
      {fields.map((f) => (
        <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-2">
          <Label htmlFor={`${id}-${f.id}`} className="truncate text-xs font-normal" title={f.label}>
            {f.label || f.id}
            {itemsOf(f).length > 0 && <span className="text-2xs text-muted-foreground"> (گروه)</span>}
          </Label>
          <Pick
            id={`${id}-${f.id}`}
            value={value[f.id] ?? "readonly"}
            options={ACCESS}
            onChange={(v) => {
              const next = { ...value }
              if (v === "readonly") delete next[f.id]
              else next[f.id] = v
              onChange(next)
            }}
          />
        </div>
      ))}
    </fieldset>
  )
}

function ActionEditor({ id, actions, fields, tasks, value, onChange }: { id: string; actions: ActionType[]; fields: FieldDef[]; tasks: { id: string; name: string }[]; value?: Rule; onChange: (r: Rule) => void }) {
  const kind = value?.type ?? ""
  const settable = fields.filter((f) => SETTABLE.has(f.type))
  const target = settable.find((f) => f.id === value?.field)
  return (
    <div className="flex flex-col gap-3">
      <Row id={id} label="اقدام">
        <Pick id={id} value={kind} onChange={(type) => onChange({ type })} options={Object.fromEntries(actions.map((a) => [a.code, a.title]))} placeholder="نوع اقدام را انتخاب کنید" />
      </Row>
      {kind === "set_field" && (
        <>
          <Row id={`${id}-field`} label="فیلد">
            <SearchPicker id={`${id}-field`} options={settable.map((f) => ({ value: f.id, label: f.label ?? f.id }))} value={String(value?.field ?? "")} onChange={(v) => onChange({ type: kind, field: v })} placeholder="انتخاب فیلد" />
          </Row>
          {target && (
            <Row id={`${id}-value`} label="مقدار">
              <ValueInput id={`${id}-value`} field={target} value={value?.value} onChange={(v) => onChange({ type: kind, field: target.id, value: v })} />
            </Row>
          )}
        </>
      )}
      {kind === "notify" && (
        <>
          <Row id={`${id}-to`} label="گیرنده‌ی اعلان">
            <AssigneeEditor id={`${id}-to`} value={value?.to as Rule | undefined} onChange={(to) => onChange({ ...value, type: kind, to })} fields={fields} tasks={tasks} />
          </Row>
          <Row id={`${id}-text`} label="متن اعلان" help="{number} شماره‌ی درخواست و {process} نام فرایند را جای‌گذاری می‌کند. با پیامک یا ایمیل هم بنا به انتخاب هر کاربر می‌رسد.">
            <CommitInput id={`${id}-text`} multiline value={String(value?.text ?? "")} onCommit={(text) => onChange({ ...value, type: kind, text })} />
          </Row>
        </>
      )}
    </div>
  )
}

/** مقدار ثابت «تنظیم مقدار فیلد» به شکل درست نوع فیلد. */
function ValueInput({ id, field, value, onChange }: { id: string; field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === "boolean") return <Pick id={id} value={value === true ? "true" : value === false ? "false" : ""} onChange={(v) => onChange(v === "true")} options={{ true: "بله", false: "خیر" }} />
  if (field.type === "choice") {
    const options = (field.props?.options ?? []) as { value: string; label: string }[]
    return <Pick id={id} value={String(value ?? "")} onChange={onChange} options={Object.fromEntries(options.map((o) => [o.value, o.label]))} />
  }
  const numeric = field.type === "number" || field.type === "amount"
  return <CommitInput id={id} dir={numeric ? "ltr" : undefined} value={value === undefined ? "" : String(value)} onCommit={(v) => onChange(numeric ? Number(v) : v)} />
}

function FlowEditor({ modeler, element, info, definition }: { modeler: Any; element: Any; info: ReturnType<typeof infoOf>; definition: FormDefinition }) {
  if (info.sourceType !== "bpmn:ExclusiveGateway") return <p className="text-2xs text-muted-foreground">شرط فقط روی مسیرهای خروجی «دروازه‌ی شرطی» گذاشته می‌شود.</p>
  const decisions = decisionsBefore(modeler, info.sourceId!)
  // «تصمیم مرحله‌ی قبل» مثل یک فیلد انتخابی در سازنده‌ی شرط
  const withDecision: FormDefinition = {
    ...definition,
    sections: [{ id: "__decision", fields: [{ id: "decision", type: "choice", label: "تصمیم مرحله‌ی قبل", props: { options: decisions } }] }, ...definition.sections],
  }
  const logic = info.props.condition
  const advanced = !logic && !!info.condition
  return (
    <div className="flex flex-col gap-3">
      <Field orientation="horizontal">
        <Switch id={`${info.id}-default`} checked={!!info.isDefault} onCheckedChange={(on) => setDefault(modeler, element, on)} />
        <FieldLabel htmlFor={`${info.id}-default`}>مسیر پیش‌فرض (وقتی شرط هیچ مسیر دیگری برقرار نیست)</FieldLabel>
      </Field>
      {!info.isDefault && (
        <>
          <p className="text-xs font-medium">شرط این مسیر</p>
          <ConditionEditor
            id={`${info.id}-condition`}
            definition={withDecision}
            value={logic ?? (advanced ? { advanced: true } : { "==": [{ var: "decision" }, decisions[0]?.value ?? ""] })}
            onChange={(next) => setCondition(modeler, element, conditionPython(next), next)}
          />
          <Row id={`${info.id}-expression`} label="عبارت شرط" help="همان شرط به زبان موتور (پایتون ساده): مقایسه، and، or، not، نام فیلدها و days_between، today، len. نوشتن مستقیم آن اختیاری است.">
            <CommitInput id={`${info.id}-expression`} dir="ltr" value={info.condition ?? ""} onCommit={(python) => setCondition(modeler, element, python.trim() || null, undefined)} />
          </Row>
        </>
      )}
    </div>
  )
}
