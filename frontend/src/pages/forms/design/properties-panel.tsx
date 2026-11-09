import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useRoleOptions } from "@/app/forms"
import { TimeInput } from "@/components/form/inputs"
import type { ChoiceOption, FieldDef, FormDefinition, FormRule, SectionDef } from "@/components/form-renderer/definition"
import { useUnitOptions } from "@/components/form-renderer/org-options"
import { InfoTip } from "@/components/info-tip"
import { SearchPicker } from "@/components/search-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, unwrap } from "@/lib/api/client"
import { useFilePolicy } from "@/lib/files"
import { onlyDigits, toEnDigits, toFaDigits } from "@/lib/format"
import type { FieldTypeSpec } from "./designer-model"
import { ConditionsEditor, FormRulesEditor, FormulaEditor, type ConditionKey } from "./rule-editors"

type PropSpec = FieldTypeSpec["props"][number]
export type Selection = { kind: "field" | "section"; id: string } | null

type Props = {
  definition: FormDefinition
  selection: Selection
  specs: Record<string, FieldTypeSpec>
  /** خطاهای سرور برای مورد انتخاب‌شده: {مسیر: پیام}، مثل «label» یا «props.max». */
  errors: Record<string, string>
  readOnly: boolean
  onField: (id: string, change: (f: FieldDef) => FieldDef, key: string) => void
  onSection: (id: string, change: (s: SectionDef) => SectionDef, key: string) => void
  /** تغییر قاعده‌های فرم (وقتی چیزی انتخاب نشده). */
  onRules: (rules: FormRule[]) => void
  /** خطاهای قاعده‌های فرم («rules.0.message»). */
  formErrors: Record<string, string>
}

/** پانل ویژگی‌ها: ویژگی‌های بخش یا فیلد انتخاب‌شده؛ ویژگی‌های هر نوع از کاتالوگ سرور ساخته می‌شوند. */
export function PropertiesPanel({ definition, selection, specs, errors, readOnly, onField, onSection, onRules, formErrors }: Props) {
  if (!selection)
    return (
      <fieldset disabled={readOnly}>
        <p className="px-3 pt-3 text-2xs text-muted-foreground">برای دیدن ویژگی‌ها، یک فیلد یا بخش را روی بوم انتخاب کنید.</p>
        <FormRulesEditor definition={definition} errors={formErrors} onChange={onRules} />
      </fieldset>
    )
  if (selection.kind === "section") {
    const section = definition.sections.find((s) => s.id === selection.id)
    if (!section) return null
    return <SectionProperties definition={definition} section={section} errors={errors} readOnly={readOnly} onChange={(c, k) => onSection(section.id, c, k)} />
  }
  for (const section of definition.sections) {
    const field = section.fields.find((f) => f.id === selection.id)
    if (field)
      return (
        <FieldProperties
          key={field.id}
          definition={definition}
          field={field}
          columns={section.columns ?? 1}
          spec={specs[field.type]}
          errors={errors}
          readOnly={readOnly}
          onChange={(c, k) => onField(field.id, c, k)}
        />
      )
  }
  return null
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

function SectionProperties({ definition, section, errors, readOnly, onChange }: { definition: FormDefinition; section: SectionDef; errors: Record<string, string>; readOnly: boolean; onChange: (c: (s: SectionDef) => SectionDef, key: string) => void }) {
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3 p-3">
      <p className="text-xs font-semibold">ویژگی‌های بخش</p>
      <Row id="section-title" label="عنوان بخش" error={errors.title}>
        <Input id="section-title" value={section.title ?? ""} maxLength={150} onChange={(e) => onChange((s) => ({ ...s, title: e.target.value }), `title:${section.id}`)} />
      </Row>
      <Row id="section-help" label="راهنمای بخش" help="در نشانه‌ی ⓘ کنار عنوان بخش نمایش داده می‌شود." error={errors.help}>
        <Textarea id="section-help" rows={2} maxLength={500} value={section.help ?? ""} onChange={(e) => onChange((s) => ({ ...s, help: e.target.value }), `help:${section.id}`)} />
      </Row>
      <Row id="section-columns" label="تعداد ستون" help="بیشینه‌ی ستون‌ها روی صفحه‌ی پهن؛ روی موبایل همیشه یک ستون." error={errors.columns}>
        <Select value={String(section.columns ?? 1)} onValueChange={(v) => onChange((s) => ({ ...s, columns: Number(v) }), `columns:${section.id}`)}>
          <SelectTrigger id="section-columns" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {toFaDigits(n)} ستون
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Separator />
      <ConditionsEditor
        definition={definition}
        owner={section.id}
        keys={["visible_if"]}
        values={{ visible_if: section.visible_if }}
        errors={errors}
        onChange={(_key, logic) => onChange((s) => withCondition(s, "visible_if", logic), `visible_if:${section.id}`)}
      />
    </fieldset>
  )
}

/** افزودن یا برداشتن یک قاعده از فیلد یا بخش. */
function withCondition<T extends object>(item: T, key: ConditionKey, logic: unknown): T {
  const next = { ...item } as Record<string, unknown>
  if (logic === undefined) delete next[key]
  else next[key] = logic
  return next as T
}

type FieldPropsEditor = {
  definition: FormDefinition
  field: FieldDef
  columns: number
  spec?: FieldTypeSpec
  errors: Record<string, string>
  readOnly: boolean
  onChange: (c: (f: FieldDef) => FieldDef, key: string) => void
}

const setProp = (name: string, value: unknown) => (f: FieldDef): FieldDef => {
  const props = { ...(f.props ?? {}) }
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete props[name]
  else props[name] = value
  const { props: _old, ...rest } = f
  return Object.keys(props).length ? { ...rest, props } : rest
}

function FieldProperties({ definition, field, columns, spec, errors, readOnly, onChange }: FieldPropsEditor) {
  if (!spec) return null
  const k = (name: string) => `${name}:${field.id}`
  const hasLabel = spec.label_required || field.type === "heading"
  const valueField = spec.has_value && spec.client_value
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-semibold">{spec.title}</p>
        <span className="text-2xs text-muted-foreground">{spec.group}</span>
      </div>
      <FieldGroup className="gap-3">
        {hasLabel && (
          <Row id="prop-label" label="برچسب" error={errors.label}>
            <Input id="prop-label" maxLength={150} value={field.label ?? ""} onChange={(e) => onChange((f) => ({ ...f, label: e.target.value }), k("label"))} />
          </Row>
        )}
        {spec.has_value && (
          <Row id="prop-help" label="راهنما" help="توضیح جمع‌شده در نشانه‌ی ⓘ کنار برچسب فیلد." error={errors.help}>
            <Textarea id="prop-help" rows={2} maxLength={500} value={field.help ?? ""} onChange={(e) => onChange((f) => ({ ...f, help: e.target.value }), k("help"))} />
          </Row>
        )}
        {valueField && (
          <div className="flex items-center gap-2">
            <Switch id="prop-required" checked={field.required === true} onCheckedChange={(v) => onChange((f) => ({ ...f, required: v }), k("required"))} />
            <Label htmlFor="prop-required" className="font-normal">
              الزامی
            </Label>
            {errors.required && <span className="text-2xs text-destructive">{errors.required}</span>}
          </div>
        )}
        {columns > 1 && (
          <Row id="prop-span" label="پهنا" error={errors.span}>
            <Select value={String(Math.min(field.span ?? 1, columns))} onValueChange={(v) => onChange((f) => ({ ...f, span: Number(v) }), k("span"))}>
              <SelectTrigger id="prop-span" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: columns }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === columns ? "تمام عرض" : `${toFaDigits(n)} ستون`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        )}
        {spec.supports_default && <DefaultEditor field={field} error={errors.default} onChange={(v) => onChange((f) => withDefault(f, v), k("default"))} />}
      </FieldGroup>
      {spec.props.length > 0 && <Separator />}
      <FieldGroup className="gap-3">
        {spec.props
          .filter((p) => p.kind !== "columns")
          .map((p) =>
            p.kind === "logic" ? (
              <FormulaEditor
                key={p.name}
                id={`prop-${p.name}`}
                definition={definition}
                except={field.id}
                value={field.props?.[p.name]}
                error={errors[`props.${p.name}`]}
                onChange={(v) => onChange(setProp(p.name, v), k(`props.${p.name}`))}
              />
            ) : (
              <PropEditor key={p.name} spec={p} value={field.props?.[p.name]} error={errors[`props.${p.name}`]} onChange={(v) => onChange(setProp(p.name, v), k(`props.${p.name}`))} />
            )
          )}
      </FieldGroup>
      <Separator />
      <ConditionsEditor
        definition={definition}
        owner={field.id}
        keys={valueField ? ["visible_if", "required_if", "readonly_if"] : ["visible_if"]}
        values={{ visible_if: field.visible_if, required_if: field.required_if, readonly_if: field.readonly_if }}
        errors={errors}
        onChange={(key, logic) => onChange((f) => withCondition(f, key, logic), k(key))}
      />
      <Separator />
      <Row
        id="prop-id"
        label="شناسه‌ی فنی"
        help="کلید این فیلد در داده‌ی ثبت‌ها و گزارش‌ها؛ حرف کوچک لاتین، رقم و _. پس از انتشار تغییرش ندهید تا ستون گزارش‌ها جدا نشود."
        error={errors.id}
      >
        <Input id="prop-id" dir="ltr" className="text-start" maxLength={40} value={field.id} onChange={(e) => onChange((f) => ({ ...f, id: e.target.value.toLowerCase() }), k("id"))} />
      </Row>
    </fieldset>
  )
}

function withDefault(f: FieldDef, value: unknown): FieldDef {
  const { default: _old, ...rest } = f
  return value === undefined || value === "" ? rest : { ...rest, default: value }
}

/** مقدار پیش‌فرض با کنترل ساده‌ی همان نوع. */
function DefaultEditor({ field, error, onChange }: { field: FieldDef; error?: string; onChange: (v: unknown) => void }) {
  const value = field.default
  const id = "prop-default"
  let control: React.ReactNode
  switch (field.type) {
    case "number":
    case "amount":
    case "scale":
      control = (
        <Input
          id={id}
          dir="ltr"
          inputMode="decimal"
          className="text-start tabular-nums"
          value={value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = toEnDigits(e.target.value).trim()
            onChange(raw === "" ? undefined : Number.isNaN(Number(raw)) ? raw : Number(raw))
          }}
        />
      )
      break
    case "time":
      control = <TimeInput id={id} value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v)} />
      break
    case "boolean":
    case "choice": {
      const options: ChoiceOption[] =
        field.type === "boolean"
          ? [
              { value: "true", label: "بله" },
              { value: "false", label: "خیر" },
            ]
          : ((field.props?.options as ChoiceOption[] | undefined) ?? [])
      control = (
        <Select value={value === undefined ? "none" : String(value)} onValueChange={(v) => onChange(v === "none" ? undefined : field.type === "boolean" ? v === "true" : v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون پیش‌فرض</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
      break
    }
    case "text":
    case "textarea":
      control = <Input id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
      break
    default:
      return null
  }
  return (
    <Row id={id} label="مقدار پیش‌فرض" error={error}>
      {control}
    </Row>
  )
}

/** ویرایشگر یک ویژگی بر اساس نوعش در کاتالوگ. */
function PropEditor({ spec, value, error, onChange }: { spec: PropSpec; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const id = `prop-${spec.name}`
  const current = value ?? spec.default
  switch (spec.kind) {
    case "bool":
      return (
        <div className="flex items-center gap-2">
          <Switch id={id} checked={current === true} onCheckedChange={(v) => onChange(v)} />
          <Label htmlFor={id} className="font-normal">
            {spec.title}
          </Label>
          {error && <span className="text-2xs text-destructive">{error}</span>}
        </div>
      )
    case "int":
    case "number":
      return (
        <Row id={id} label={spec.title} error={error}>
          <Input
            id={id}
            dir="ltr"
            inputMode={spec.kind === "int" ? "numeric" : "decimal"}
            className="text-start tabular-nums"
            placeholder={spec.default !== null && spec.default !== undefined ? String(spec.default) : undefined}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => {
              const raw = spec.kind === "int" ? onlyDigits(e.target.value) : toEnDigits(e.target.value).replace(/[^\d.-]/g, "")
              onChange(raw === "" ? undefined : Number.isNaN(Number(raw)) ? raw : Number(raw))
            }}
          />
        </Row>
      )
    case "text":
      return (
        <Row id={id} label={spec.title} error={error}>
          {(spec.max ?? 0) > 200 ? (
            <Textarea id={id} rows={3} maxLength={spec.max ?? undefined} value={String(current ?? "")} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <Input id={id} maxLength={spec.max ?? undefined} value={String(current ?? "")} onChange={(e) => onChange(e.target.value)} />
          )}
        </Row>
      )
    case "choice":
      return (
        <Row id={id} label={spec.title} error={error}>
          <Select value={String(current ?? "")} onValueChange={(v) => onChange(v)}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spec.choices.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      )
    case "choice_list": {
      const selected = Array.isArray(current) ? (current as string[]) : []
      return (
        <Row id={id} label={spec.title} error={error}>
          <div id={id} className="flex flex-wrap gap-x-4 gap-y-2">
            {spec.choices.map((c) => (
              <div key={c.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${c.value}`}
                  checked={selected.includes(c.value)}
                  onCheckedChange={(on) => onChange(spec.choices.map((x) => x.value).filter((v) => (v === c.value ? on === true : selected.includes(v))))}
                />
                <Label htmlFor={`${id}-${c.value}`} className="font-normal">
                  {c.label}
                </Label>
              </div>
            ))}
          </div>
        </Row>
      )
    }
    case "options":
      return <OptionsEditor id={id} title={spec.title} value={(current as ChoiceOption[] | undefined) ?? []} error={error} onChange={onChange} prefix={spec.name === "rows" ? "row" : "opt"} />
    case "lookup_list":
      return <LookupListEditor id={id} title={spec.title} value={String(current ?? "")} error={error} onChange={onChange} />
    case "org_unit":
      return <UnitEditor id={id} title={spec.title} value={typeof current === "number" ? current : undefined} error={error} onChange={onChange} />
    case "role":
      return <RoleEditor id={id} title={spec.title} value={typeof current === "number" ? current : undefined} error={error} onChange={onChange} />
    case "extensions":
      return <ExtensionsEditor id={id} title={spec.title} value={Array.isArray(current) ? (current as string[]) : []} error={error} onChange={onChange} />
    default:
      return null
  }
}

/** گزینه‌ها (یا معیارهای ماتریس): برچسب هر کدام، افزودن، حذف و جابه‌جایی؛ مقدار فنی خودکار و پایدار است. */
function OptionsEditor({ id, title, value, error, onChange, prefix }: { id: string; title: string; value: ChoiceOption[]; error?: string; onChange: (v: unknown) => void; prefix: string }) {
  const update = (i: number, label: string) => onChange(value.map((o, j) => (j === i ? { ...o, label } : o)))
  const move = (i: number, d: number) => {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  const add = () => {
    const taken = new Set(value.map((o) => o.value))
    let n = value.length + 1
    while (taken.has(`${prefix}_${n}`)) n++
    onChange([...value, { value: `${prefix}_${n}`, label: `${prefix === "row" ? "معیار" : "گزینه‌ی"} ${toFaDigits(n)}` }])
  }
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={`${id}-0`}>{title}</FieldLabel>
      <ul className="flex flex-col gap-1.5" aria-label={title}>
        {value.map((o, i) => (
          <li key={o.value} className="flex items-center gap-1">
            <Input id={`${id}-${i}`} aria-label={`${title} ${toFaDigits(i + 1)}`} value={o.label} maxLength={150} onChange={(e) => update(i, e.target.value)} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`بالا بردن ${o.label}`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`پایین بردن ${o.label}`} disabled={i === value.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف ${o.label}`} disabled={value.length <= 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={add}>
        <Plus /> افزودن
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function LookupListEditor({ id, title, value, error, onChange }: { id: string; title: string; value: string; error?: string; onChange: (v: unknown) => void }) {
  const lists = useQuery({ queryKey: ["lookup-lists"], queryFn: () => unwrap(api.GET("/api/lookups/lists/")), staleTime: 5 * 60_000 }).data ?? []
  return (
    <Row id={id} label={title} help="مقدارهای فهرست در «فهرست‌های پایه» ویرایش می‌شوند." error={error}>
      <SearchPicker id={id} options={lists.map((l) => ({ value: l.code, label: l.name }))} value={value} onChange={(v) => onChange(v)} placeholder="انتخاب فهرست" />
    </Row>
  )
}

function UnitEditor({ id, title, value, error, onChange }: { id: string; title: string; value?: number; error?: string; onChange: (v: unknown) => void }) {
  const options = useUnitOptions()
  return (
    <Row id={id} label={title} error={error}>
      <SearchPicker id={id} options={[{ value: "", label: "بدون محدودیت" }, ...options]} value={value ? String(value) : ""} onChange={(v) => onChange(v ? Number(v) : undefined)} placeholder="بدون محدودیت" />
    </Row>
  )
}

function RoleEditor({ id, title, value, error, onChange }: { id: string; title: string; value?: number; error?: string; onChange: (v: unknown) => void }) {
  const roles = useRoleOptions()
  return (
    <Row id={id} label={title} error={error}>
      <SearchPicker id={id} options={[{ value: "", label: "بدون محدودیت" }, ...roles]} value={value ? String(value) : ""} onChange={(v) => onChange(v ? Number(v) : undefined)} placeholder="بدون محدودیت" />
    </Row>
  )
}

function ExtensionsEditor({ id, title, value, error, onChange }: { id: string; title: string; value: string[]; error?: string; onChange: (v: unknown) => void }) {
  const types = (useFilePolicy().data?.types ?? []).filter((t) => t.allowed)
  return (
    <Row id={id} label={title} help="خالی یعنی همه‌ی نوع‌های مجاز در تنظیمات «فایل‌ها و پیوست‌ها»." error={error}>
      <div id={id} className="flex flex-wrap gap-x-4 gap-y-2">
        {types.map((t) => (
          <div key={t.extension} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${t.extension}`}
              checked={value.includes(t.extension)}
              onCheckedChange={(on) => onChange(on === true ? [...value, t.extension] : value.filter((e) => e !== t.extension))}
            />
            <Label htmlFor={`${id}-${t.extension}`} className="font-normal">
              <span dir="ltr">.{t.extension}</span>
            </Label>
          </div>
        ))}
      </div>
    </Row>
  )
}
