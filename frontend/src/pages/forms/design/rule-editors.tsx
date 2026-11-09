import type * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { useLookupItems } from "@/app/lookups"
import { InfoTip } from "@/components/info-tip"
import { JalaliDateInput, TimeInput } from "@/components/form/inputs"
import type { ChoiceOption, FieldDef, FormDefinition, FormRule } from "@/components/form-renderer/definition"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toEnDigits, toFaDigits } from "@/lib/format"
import {
  conditionLogic,
  FORMULA_LABELS,
  formulaLogic,
  needsRight,
  OP_LABELS,
  opsFor,
  parseCondition,
  parseFormula,
  referableFields,
  type Clause,
  type Condition,
  type FormulaOp,
  type Op,
  type Operand,
} from "./rule-model"

const DATE_TYPES = new Set(["date", "datetime"])

/** جمله‌ی تازه با نخستین فیلد و نخستین عملگر مناسب آن (برای گزینه‌ها «برابر است با»). */
const defaultClause = (fields: FieldDef[]): Clause => ({ field: fields[0]?.id ?? "", op: fields[0] ? opsFor(fields[0])[0] : "filled" })
const NUMBER_TYPES = new Set(["number", "amount", "scale", "calculated"])

function Pick({ id, label, value, onChange, items, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; items: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className="w-full min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** گزینه‌های مقدار برای فیلدهای انتخابی (گزینه‌ها، بله/خیر، فهرست پایه). */
function useValueOptions(field?: FieldDef): ChoiceOption[] | null {
  const lookup = useLookupItems(field?.type === "lookup" ? String(field.props?.list ?? "") : "")
  if (!field) return null
  if (field.type === "boolean")
    return [
      { value: "true", label: "بله" },
      { value: "false", label: "خیر" },
    ]
  if (field.type === "choice" || field.type === "multi_choice") return (field.props?.options as ChoiceOption[] | undefined) ?? []
  if (field.type === "lookup") return (lookup.data ?? []).map((i) => ({ value: i.code, label: i.title }))
  return null
}

/** سمت راست شرط یا عملوند فرمول: مقدار ثابت، فیلد دیگر یا «امروز». */
function OperandInput({ id, label, field, fields, value, onChange, numeric }: { id: string; label: string; field?: FieldDef; fields: FieldDef[]; value?: Operand; onChange: (o: Operand) => void; numeric?: boolean }) {
  const options = useValueOptions(field)
  const isDate = field ? DATE_TYPES.has(field.type) : false
  const kind = value?.kind ?? "value"
  const kinds = [
    { value: "value", label: "مقدار" },
    ...(fields.length || kind === "field" ? [{ value: "field", label: "فیلد دیگر" }] : []),
    ...(isDate ? [{ value: "today", label: "امروز" }] : []),
  ]
  const constant = value?.kind === "value" ? value.value : ""
  let input: React.ReactNode = null
  if (kind === "field")
    input = (
      <Pick
        id={id}
        label={`${label}: فیلد`}
        value={value?.kind === "field" ? value.field : ""}
        onChange={(f) => onChange({ kind: "field", field: f })}
        items={fields.map((f) => ({ value: f.id, label: f.label || f.id }))}
        placeholder="انتخاب فیلد"
      />
    )
  else if (kind === "value" && options)
    input = (
      <Pick
        id={id}
        label={`${label}: مقدار`}
        value={String(constant)}
        onChange={(x) => onChange({ kind: "value", value: field?.type === "boolean" ? x === "true" : x })}
        items={options}
        placeholder="انتخاب"
      />
    )
  else if (kind === "value" && field && DATE_TYPES.has(field.type))
    input = <JalaliDateInput id={id} aria-label={`${label}: تاریخ`} value={String(constant)} onChange={(x) => onChange({ kind: "value", value: x })} />
  else if (kind === "value" && field?.type === "time") input = <TimeInput id={id} aria-label={`${label}: ساعت`} value={String(constant)} onChange={(x) => onChange({ kind: "value", value: x })} />
  else if (kind === "value")
    input = (
      <Input
        id={id}
        aria-label={`${label}: مقدار`}
        dir={numeric || (field && NUMBER_TYPES.has(field.type)) ? "ltr" : undefined}
        className="text-start"
        value={String(constant)}
        onChange={(e) => {
          const raw = toEnDigits(e.target.value)
          const asNumber = numeric || (field && NUMBER_TYPES.has(field.type))
          onChange({ kind: "value", value: asNumber && raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw })
        }}
      />
    )
  return (
    <div className="flex gap-1.5">
      <div className="w-28 shrink-0">
        <Pick id={`${id}-kind`} label={`${label}: نوع`} value={kind} onChange={(k) => onChange(k === "today" ? { kind: "today" } : k === "field" ? { kind: "field", field: fields[0]?.id ?? "" } : { kind: "value", value: "" })} items={kinds} />
      </div>
      <div className="min-w-0 flex-1">{input}</div>
    </div>
  )
}

type ConditionProps = {
  id: string
  definition: FormDefinition
  /** فیلدی که شرط برای خودش است (در فهرست فیلدها نمی‌آید). */
  except?: string
  value: unknown
  onChange: (logic: unknown) => void
}

/** سازنده‌ی شرط: «همه»/«یکی از» چند جمله‌ی «فیلد ـ عملگر ـ مقدار». */
export function ConditionEditor({ id, definition, except, value, onChange }: ConditionProps) {
  const fields = referableFields(definition, except)
  const parsed = parseCondition(value)
  if (!parsed)
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-2xs text-muted-foreground">
        این شرط پیشرفته است و با سازنده ساخته نشده؛ برای ساختن دوباره حذفش کنید.
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(conditionLogic({ mode: "all", clauses: [defaultClause(fields)] }))}>
          ساخت دوباره
        </Button>
      </div>
    )
  const set = (next: Condition) => onChange(conditionLogic(next))
  const fieldOf = (fid: string) => fields.find((f) => f.id === fid)
  const updateClause = (i: number, patch: Partial<Clause>) => set({ ...parsed, clauses: parsed.clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
      {parsed.clauses.length > 1 && (
        <Pick
          id={`${id}-mode`}
          label="ترکیب شرط‌ها"
          value={parsed.mode}
          onChange={(m) => set({ ...parsed, mode: m as Condition["mode"] })}
          items={[
            { value: "all", label: "همه‌ی شرط‌های زیر درست باشند" },
            { value: "any", label: "دست‌کم یکی درست باشد" },
          ]}
        />
      )}
      {parsed.clauses.map((c, i) => {
        const field = fieldOf(c.field)
        const ops = field ? opsFor(field) : (["eq", "ne", "empty", "filled"] as Op[])
        const label = `شرط ${toFaDigits(i + 1)}`
        return (
          <div key={i} className="flex flex-col gap-1.5 border-b pb-2 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <Pick
                  id={`${id}-${i}-field`}
                  label={`${label}: فیلد`}
                  value={c.field}
                  onChange={(f) => updateClause(i, { field: f, op: opsFor(fieldOf(f)!)[0], right: undefined })}
                  items={fields.map((f) => ({ value: f.id, label: f.label || f.id }))}
                  placeholder="انتخاب فیلد"
                />
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف ${label}`} disabled={parsed.clauses.length === 1} onClick={() => set({ ...parsed, clauses: parsed.clauses.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
            <Pick id={`${id}-${i}-op`} label={`${label}: عملگر`} value={c.op} onChange={(op) => updateClause(i, { op: op as Op, right: needsRight(op as Op) ? c.right : undefined })} items={ops.map((o) => ({ value: o, label: OP_LABELS[o] }))} />
            {needsRight(c.op) && <OperandInput id={`${id}-${i}-right`} label={label} field={field} fields={fields.filter((f) => f.id !== c.field)} value={c.right} onChange={(right) => updateClause(i, { right })} />}
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set({ ...parsed, clauses: [...parsed.clauses, defaultClause(fields)] })}>
        <Plus /> شرط دیگر
      </Button>
    </div>
  )
}

const CONDITIONS = [
  { key: "visible_if", label: "نمایش شرطی", help: "فیلد فقط وقتی دیده و ذخیره می‌شود که شرط درست باشد." },
  { key: "required_if", label: "الزامی شرطی", help: "وقتی شرط درست است، پر کردن فیلد الزامی است." },
  { key: "readonly_if", label: "فقط‌خواندنی شرطی", help: "وقتی شرط درست است، مقدار فیلد قابل تغییر نیست (مقدار قبلی یا پیش‌فرض می‌ماند)." },
] as const
export type ConditionKey = (typeof CONDITIONS)[number]["key"]

/** قاعده‌های یک فیلد یا بخش: هر کدام با یک کلید روشن/خاموش و سازنده‌ی شرط. */
export function ConditionsEditor({
  definition,
  owner,
  keys,
  values,
  errors,
  onChange,
}: {
  definition: FormDefinition
  owner: string
  keys: readonly ConditionKey[]
  values: Partial<Record<ConditionKey, unknown>>
  errors: Record<string, string>
  onChange: (key: ConditionKey, logic: unknown | undefined) => void
}) {
  const candidates = referableFields(definition, owner)
  const first = candidates[0]
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold">قاعده‌ها</p>
      {!first && <p className="text-2xs text-muted-foreground">برای قاعده، ابتدا فیلدی مثل «انتخاب یکی» یا «عدد» به فرم اضافه کنید.</p>}
      {first &&
        CONDITIONS.filter((c) => keys.includes(c.key)).map((c) => {
          const on = values[c.key] !== undefined
          const id = `rule-${c.key}`
          return (
            <Field key={c.key} data-invalid={!!errors[c.key]}>
              <div className="flex items-center gap-2">
                <Switch
                  id={id}
                  checked={on}
                  onCheckedChange={(v) => onChange(c.key, v ? conditionLogic({ mode: "all", clauses: [defaultClause(candidates)] }) : undefined)}
                />
                <Label htmlFor={id} className="font-normal">
                  {c.label}
                </Label>
                <InfoTip label={`راهنمای ${c.label}`}>{c.help}</InfoTip>
              </div>
              {on && <ConditionEditor id={`${id}-editor`} definition={definition} except={owner} value={values[c.key]} onChange={(l) => onChange(c.key, l)} />}
              {errors[c.key] && <FieldError>{errors[c.key]}</FieldError>}
            </Field>
          )
        })}
    </div>
  )
}

/** سازنده‌ی فرمول فیلد محاسبه‌ای: عمل و عملوندها (فیلد یا عدد ثابت). */
export function FormulaEditor({ id, definition, except, value, error, onChange }: { id: string; definition: FormDefinition; except: string; value: unknown; error?: string; onChange: (logic: unknown) => void }) {
  const fields = referableFields(definition, except)
  const parsed = parseFormula(value) ?? { op: "sum" as FormulaOp, operands: [] }
  const numberFields = fields.filter((f) => NUMBER_TYPES.has(f.type))
  const dateFields = fields.filter((f) => f.type === "date")
  const pool = parsed.op === "days" ? dateFields : numberFields
  const set = (op: FormulaOp, operands: Operand[]) => onChange(formulaLogic({ op, operands }))
  const count = parsed.op === "sum" ? Math.max(parsed.operands.length, 2) : 2
  // عملوند پیش‌فرض: فیلد مناسب اگر هست، وگرنه عدد ثابت (نه فیلد خالی).
  const operands = Array.from({ length: count }, (_, i): Operand => parsed.operands[i] ?? (pool[i] ? { kind: "field", field: pool[i].id } : { kind: "value", value: 0 }))
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={`${id}-op`}>فرمول</FieldLabel>
      <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
        <Pick
          id={`${id}-op`}
          label="عمل"
          value={parsed.op}
          onChange={(op) => {
            // عملوندهای پیش‌فرض همان‌جا ذخیره می‌شوند (نه فقط نمایش)، تا فرمول بی‌عملوند منتشر نشود.
            const next = op === "days" ? dateFields : numberFields
            set(op as FormulaOp, [0, 1].map((i): Operand => (next[i] ? { kind: "field", field: next[i].id } : { kind: "value", value: 0 })))
          }}
          items={(Object.keys(FORMULA_LABELS) as FormulaOp[]).map((o) => ({ value: o, label: FORMULA_LABELS[o] }))}
        />
        {operands.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              {parsed.op === "days" ? (
                <Pick
                  id={`${id}-${i}`}
                  label={i === 0 ? "از تاریخ" : "تا تاریخ"}
                  value={o.kind === "field" ? o.field : ""}
                  onChange={(f) => set(parsed.op, operands.map((x, j) => (j === i ? { kind: "field", field: f } : x)))}
                  items={dateFields.map((f) => ({ value: f.id, label: f.label || f.id }))}
                  placeholder={i === 0 ? "از تاریخ" : "تا تاریخ"}
                />
              ) : (
                <OperandInput
                  id={`${id}-${i}`}
                  label={`عملوند ${toFaDigits(i + 1)}`}
                  numeric
                  fields={numberFields}
                  value={o}
                  onChange={(x) => set(parsed.op, operands.map((y, j) => (j === i ? x : y)))}
                />
              )}
            </div>
            {parsed.op === "sum" && operands.length > 2 && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف عملوند ${toFaDigits(i + 1)}`} onClick={() => set("sum", operands.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {pool.length === 0 && (
          <p className="text-2xs text-muted-foreground">
            {parsed.op === "days" ? "برای این عمل دو فیلد «تاریخ» به فرم اضافه کنید." : "فیلد عددی (عدد، مبلغ، امتیاز یا محاسبه‌ای) در فرم نیست؛ عدد ثابت وارد کنید یا برای تاریخ‌ها عمل «شمار روز» را انتخاب کنید."}
          </p>
        )}
        {parsed.op === "sum" && (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("sum", [...operands, numberFields[0] ? { kind: "field", field: numberFields[0].id } : { kind: "value", value: 0 }])}>
            <Plus /> عملوند دیگر
          </Button>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

/** قاعده‌های فرم (اعتبارسنجی بین فیلدها): شرطی که باید درست باشد، پیام، و فیلدی که پیام زیرش می‌آید. */
export function FormRulesEditor({ definition, errors, onChange }: { definition: FormDefinition; errors: Record<string, string>; onChange: (rules: FormRule[]) => void }) {
  const rules = definition.rules ?? []
  const fields = referableFields(definition)
  const update = (i: number, patch: Partial<FormRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const add = () => {
    const taken = new Set(rules.map((r) => r.id))
    let n = rules.length + 1
    while (taken.has(`rule_${n}`)) n++
    onChange([...rules, { id: `rule_${n}`, condition: conditionLogic({ mode: "all", clauses: [defaultClause(fields)] }), message: "", field: fields[0]?.id ?? null }])
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-1">
        <p className="text-xs font-semibold">اعتبارسنجی بین فیلدها</p>
        <InfoTip label="راهنمای اعتبارسنجی بین فیلدها">هنگام ثبت نهایی، اگر شرط درست نباشد پیام زیر فیلد انتخاب‌شده می‌آید. مثال: «تا تاریخ» بیشتر یا برابر «از تاریخ».</InfoTip>
      </div>
      {rules.map((r, i) => (
        <div key={r.id} className="flex flex-col gap-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">قاعده‌ی {toFaDigits(i + 1)}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف قاعده‌ی ${toFaDigits(i + 1)}`} onClick={() => onChange(rules.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
          <ConditionEditor id={`form-rule-${i}`} definition={definition} value={r.condition} onChange={(condition) => update(i, { condition })} />
          {errors[`rules.${i}.condition`] && <FieldError>{errors[`rules.${i}.condition`]}</FieldError>}
          <Field data-invalid={!!errors[`rules.${i}.message`]}>
            <FieldLabel htmlFor={`form-rule-${i}-message`}>پیام خطا</FieldLabel>
            <Input id={`form-rule-${i}-message`} maxLength={200} value={r.message} onChange={(e) => update(i, { message: e.target.value })} />
            {errors[`rules.${i}.message`] && <FieldError>{errors[`rules.${i}.message`]}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`form-rule-${i}-field`}>نمایش پیام زیر</FieldLabel>
            <Pick id={`form-rule-${i}-field`} label="نمایش پیام زیر" value={r.field ?? ""} onChange={(f) => update(i, { field: f })} items={fields.map((f) => ({ value: f.id, label: f.label || f.id }))} />
          </Field>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={!fields.length} onClick={add}>
        <Plus /> قاعده‌ی تازه
      </Button>
    </div>
  )
}
