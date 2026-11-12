import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useRoleOptions } from "@/app/forms"
import { useForm } from "react-hook-form"
import { JalaliDateInput } from "@/components/form/inputs"
import { itemsOf, toFormValues, toPayload, type ChoiceOption, type FieldDef, type FormDefinition, type FormRule, type FormValues, type PrefillSource, type SectionDef } from "@/components/form-renderer/definition"
import { FieldView } from "@/components/form-renderer/form-renderer"
import { useUnitOptions } from "@/components/form-renderer/org-options"
import { FileDropzone } from "@/components/files"
import { FileIcon } from "@/components/files/file-icon"
import { InfoTip } from "@/components/info-tip"
import { RichTextEditor } from "@/components/rich-text"
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
import { inlineUrl, useFileInfo, useFilePolicy, type StoredFile } from "@/lib/files"
import { formatFileSize, onlyDigits, toEnDigits, toFaDigits } from "@/lib/format"
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
  /** ویژگی سطح فرم (نمایش مرحله‌ای، نشانه‌ی الزامی، متن‌ها)؛ undefined یعنی برداشتن. */
  onFormProp: (name: FormProp, value: unknown) => void
  /** خطاهای قاعده‌های فرم («rules.0.message»). */
  formErrors: Record<string, string>
}

/** پانل ویژگی‌ها: ویژگی‌های بخش یا فیلد انتخاب‌شده؛ ویژگی‌های هر نوع از کاتالوگ سرور ساخته می‌شوند. */
export function PropertiesPanel({ definition, selection, specs, errors, readOnly, onField, onSection, onRules, onFormProp, formErrors }: Props) {
  if (!selection)
    return (
      <fieldset disabled={readOnly}>
        <p className="px-3 pt-3 text-2xs text-muted-foreground">برای دیدن ویژگی‌ها، یک فیلد یا بخش را روی بوم انتخاب کنید.</p>
        <FormProperties definition={definition} errors={formErrors} onChange={onFormProp} />
        <FormRulesEditor definition={definition} errors={formErrors} onChange={onRules} />
      </fieldset>
    )
  if (selection.kind === "section") {
    const section = definition.sections.find((s) => s.id === selection.id)
    if (!section) return null
    return <SectionProperties definition={definition} section={section} errors={errors} readOnly={readOnly} onChange={(c, k) => onSection(section.id, c, k)} />
  }
  for (const section of definition.sections)
    for (const f of section.fields) {
      // فیلد بخش، یا فیلد درون گروه (بدون چیدمان و شرط؛ هر مورد گروه همان فیلدها را دارد)
      const item = f.id === selection.id ? undefined : itemsOf(f).find((i) => i.id === selection.id)
      const field = f.id === selection.id ? f : item
      if (field)
        return (
          <FieldProperties
            key={field.id}
            definition={definition}
            field={field}
            group={item ? f : undefined}
            columns={item ? 1 : (section.columns ?? 1)}
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
      <Row id="section-labels" label="جای برچسب‌ها" help="«خودکار»: کنار فیلد تا دو ستون و بالای فیلد در بخش سه‌ستونه." error={errors.labels}>
        <Select value={section.labels ?? "auto"} onValueChange={(v) => onChange((s) => ({ ...s, labels: v as SectionDef["labels"] }), `labels:${section.id}`)}>
          <SelectTrigger id="section-labels" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">خودکار</SelectItem>
            <SelectItem value="side">کنار فیلد</SelectItem>
            <SelectItem value="top">بالای فیلد</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row id="section-columns" label="تعداد ستون" help="از پهنای تبلت به بالا دقیقاً همین تعداد ستون، در طراح و هنگام پر کردن؛ روی موبایل همیشه یک ستون." error={errors.columns}>
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
  /** گروهی که این فیلد درون آن است */
  group?: FieldDef
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

function FieldProperties({ definition, field, group, columns, spec, errors, readOnly, onChange }: FieldPropsEditor) {
  if (!spec) return null
  const k = (name: string) => `${name}:${field.id}`
  const hasLabel = spec.label_required || field.type === "heading"
  const valueField = spec.has_value && spec.client_value
  // ویژگی‌های سطح فرم (فقط‌خواندنی، یکتا، پیش‌پر، شرط‌ها) برای فیلد درون گروه نیستند
  const formLevel = valueField && !group
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-semibold">{spec.title}</p>
        <span className="text-2xs text-muted-foreground">{group ? `درون «${group.label}»` : spec.group}</span>
      </div>
      {/* ایراد خود نوع (مثلاً پیوست در خانه‌ی جدول) */}
      {errors.type && <FieldError>{errors.type}</FieldError>}
      {field.type === "table" && <p className="text-2xs text-muted-foreground">برای افزودن فیلد به این گروه، گروه را روی بوم انتخاب کنید و نوع فیلد را از جعبه‌ابزار بزنید یا روی فیلدهای گروه بکشید.</p>}
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
        {formLevel && (
          <FlagSwitch id="prop-readonly" label="فقط‌خواندنی" help="پرکننده مقدار را می‌بیند ولی نمی‌تواند تغییرش دهد؛ همراه «مقدار پیش‌فرض» یا «پیش‌پر» به کار می‌آید." checked={field.readonly === true} error={errors.readonly} onChange={(v) => onChange((f) => withFlag(f, "readonly", v), k("readonly"))} />
        )}
        {spec.unique && !group && (
          <FlagSwitch id="prop-unique" label="مقدار یکتا" help="همین مقدار در ثبت نهایی دیگری از این فرم پذیرفته نمی‌شود؛ مثل کد ملی در فرم ثبت‌نام." checked={field.unique === true} error={errors.unique} onChange={(v) => onChange((f) => withFlag(f, "unique", v), k("unique"))} />
        )}
        {spec.prefill.length > 0 && !group && (
          <Row id="prop-prefill" label="پیش‌پر از حساب کاربر" help="در فرم تازه، این فیلد با اطلاعات حساب پرکننده پر می‌شود و او می‌تواند تغییرش دهد (مگر فقط‌خواندنی باشد)." error={errors.prefill}>
            <Select value={field.prefill ?? "none"} onValueChange={(v) => onChange((f) => withPrefill(f, v === "none" ? undefined : (v as PrefillSource)), k("prefill"))}>
              <SelectTrigger id="prop-prefill" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون پیش‌پر</SelectItem>
                {spec.prefill.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
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
        {columns > 1 && (
          <div className="flex items-center gap-2">
            <Switch id="prop-new-row" checked={field.new_row === true} onCheckedChange={(v) => onChange((f) => (v ? { ...f, new_row: true } : (({ new_row: _n, ...rest }) => rest)(f)), k("new_row"))} />
            <Label htmlFor="prop-new-row" className="font-normal">
              شروع از ردیف تازه
            </Label>
            <InfoTip label="راهنمای شروع از ردیف تازه">این فیلد از ستون اول یک ردیف تازه شروع می‌شود، حتی اگر در ردیف قبلی جا باشد.</InfoTip>
          </div>
        )}
        {spec.supports_default && <DefaultEditor field={field} error={errors.default} onChange={(v) => onChange((f) => withDefault(f, v), k("default"))} />}
      </FieldGroup>
      {spec.props.length > 0 && <Separator />}
      <FieldGroup className="gap-3">
        {spec.props
          .filter((p) => p.kind !== "columns" && (DEPENDS[p.name]?.(field.props ?? {}) ?? true))
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
      {!group && (
        <>
          <Separator />
          <ConditionsEditor
            definition={definition}
            owner={field.id}
            keys={valueField ? ["visible_if", "required_if", "readonly_if"] : ["visible_if"]}
            values={{ visible_if: field.visible_if, required_if: field.required_if, readonly_if: field.readonly_if }}
            errors={errors}
            onChange={(key, logic) => onChange((f) => withCondition(f, key, logic), k(key))}
          />
        </>
      )}
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

/** ویژگی‌هایی که فقط با روشن بودن ویژگی دیگری معنا دارند. */
const DEPENDS: Record<string, (props: Record<string, unknown>) => boolean> = {
  other_label: (p) => !!p.allow_other,
  pattern_message: (p) => !!p.pattern,
  card_columns: (p) => p.display === "cards",
}

function withFlag(f: FieldDef, key: "readonly" | "unique", on: boolean): FieldDef {
  const next = { ...f }
  if (on) next[key] = true
  else delete next[key]
  return next
}

function withPrefill(f: FieldDef, source: PrefillSource | undefined): FieldDef {
  const { prefill: _old, ...rest } = f
  return source ? { ...rest, prefill: source } : rest
}

function FlagSwitch({ id, label, help, checked, error, onChange }: { id: string; label: string; help: string; checked: boolean; error?: string; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <InfoTip label={`راهنمای ${label}`}>{help}</InfoTip>
      {error && <span className="text-2xs text-destructive">{error}</span>}
    </div>
  )
}

function withDefault(f: FieldDef, value: unknown): FieldDef {
  const { default: _old, ...rest } = f
  return value === undefined || value === "" ? rest : { ...rest, default: value }
}

/**
 * مقدار پیش‌فرض با همان کنترلی که پرکننده می‌بیند (تاریخ، چندانتخابی، کد ملی، پلاک، فهرست پایه و…)؛
 * مقدار هر تغییر مثل ارسال فرم پاک‌سازی می‌شود.
 */
function DefaultEditor({ field, error, onChange }: { field: FieldDef; error?: string; onChange: (v: unknown) => void }) {
  // فیلد پنهان کنترل دیدنی ندارد
  if (field.type === "hidden")
    return (
      <Row id="prop-default" label="مقدار پیش‌فرض" help="وقتی پارامتر نشانی صفحه نیامده باشد." error={error}>
        <Input id="prop-default" maxLength={500} value={typeof field.default === "string" ? field.default : ""} onChange={(e) => onChange(e.target.value || undefined)} />
      </Row>
    )
  return <ControlDefaultEditor field={field} error={error} onChange={onChange} />
}

function ControlDefaultEditor({ field, error, onChange }: { field: FieldDef; error?: string; onChange: (v: unknown) => void }) {
  const [definition] = React.useState<FormDefinition>(() => ({
    sections: [{ id: "default", fields: [{ id: DEFAULT_ID, type: field.type, label: "مقدار پیش‌فرض", props: field.props }] }],
  }))
  const { control, subscribe } = useForm<FormValues>({ defaultValues: toFormValues(definition, { [DEFAULT_ID]: field.default }) })
  const changed = React.useEffectEvent((values: FormValues) => {
    const next = toPayload(definition, values)[DEFAULT_ID]
    if (JSON.stringify(next) !== JSON.stringify(field.default)) onChange(next)
  })
  React.useEffect(() => subscribe({ formState: { values: true }, callback: ({ values }) => changed(values) }), [subscribe])
  return (
    <div className="flex flex-col gap-1">
      <FieldView field={{ ...definition.sections[0].fields[0], props: field.props }} control={control} layout="stacked" />
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

const DEFAULT_ID = "default_value"

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
    case "html":
      return (
        <Field data-invalid={!!error}>
          <FieldLabel id={`${id}-label`}>{spec.title}</FieldLabel>
          <RichTextEditor id={id} value={String(value ?? "")} onChange={(v) => onChange(v || undefined)} labelledBy={`${id}-label`} invalid={!!error} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
      )
    case "file":
      return <FilePropEditor id={id} title={spec.title} accept={spec.accept} value={typeof value === "string" ? value : undefined} error={error} onChange={onChange} />
    case "date":
      return (
        <Row id={id} label={spec.title} error={error}>
          <JalaliDateInput id={id} value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v || undefined)} />
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
    case "record_source":
      return <RecordSourceEditor id={id} title={spec.title} value={typeof current === "string" ? current : ""} error={error} onChange={onChange} />
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

/** منبع ارجاع: ثبت‌های یک فرم یا درخواست‌های یک فرایند. */
function RecordSourceEditor({ id, title, value, error, onChange }: { id: string; title: string; value: string; error?: string; onChange: (v: unknown) => void }) {
  const sources = useQuery({ queryKey: ["forms", "record-sources"], queryFn: () => unwrap(api.GET("/api/forms/record-sources/")), staleTime: 60_000 }).data ?? []
  const options = sources.map((o) => ({ value: o.value, label: o.label, hint: o.group }))
  return (
    <Row id={id} label={title} error={error}>
      <SearchPicker id={id} options={options} value={value} onChange={(v) => onChange(v || undefined)} placeholder="انتخاب فرم یا فرایند" />
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

/** فایل تعریف فرم (تصویر یا فایل راهنما): پیش‌نمایش یا نام فایل فعلی و بارگذاری فایل تازه. */
function FilePropEditor({ id, title, accept, value, error, onChange }: { id: string; title: string; accept: string[]; value?: string; error?: string; onChange: (v: unknown) => void }) {
  const [added, setAdded] = React.useState<StoredFile | null>(null)
  const known = useFileInfo(value && added?.id !== value ? [value] : []).data?.[0]
  const file = added?.id === value ? added : known
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      {value && file && (
        <div className="flex items-center gap-2 rounded-md border p-1.5">
          {file.is_image ? <img src={inlineUrl(file)} alt="" className="size-10 rounded object-cover" /> : <FileIcon name={file.name} />}
          <span className="min-w-0 flex-1 truncate text-xs" dir="auto">
            {file.name}
          </span>
          <span className="text-2xs text-muted-foreground">{formatFileSize(file.size)}</span>
        </div>
      )}
      <FileDropzone
        id={id}
        imagesOnly={accept.length > 0 && accept.every((e) => IMAGE_EXTENSIONS.has(e))}
        extensions={accept.length ? accept : undefined}
        onUploaded={(f) => {
          setAdded(f)
          onChange(f.id)
        }}
        aria-invalid={!!error}
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"])

type FormProp = "steps" | "numbered" | "required_mark" | "submit_label" | "intro" | "confirmation"

/** ویژگی‌های سطح فرم که با نسخه ذخیره و در پیش‌نمایش دیده می‌شوند. */
function FormProperties({ definition, errors, onChange }: { definition: FormDefinition; errors: Record<string, string>; onChange: (name: FormProp, value: unknown) => void }) {
  return (
    <div className="flex flex-col gap-3 px-3 pt-3">
      <p className="text-xs font-semibold">ویژگی‌های فرم</p>
      <FlagSwitch
        id="form-steps"
        label="نمایش مرحله‌ای"
        help="هر بخش یک مرحله با نوار پیشرفت و دکمه‌های «مرحله‌ی قبل/بعد»؛ پیش از رفتن به مرحله‌ی بعد، فیلدهای همان مرحله بررسی می‌شوند."
        checked={definition.steps === true}
        error={errors.steps}
        onChange={(v) => onChange("steps", v || undefined)}
      />
      <FlagSwitch
        id="form-numbered"
        label="شماره‌گذاری فیلدها"
        help="هر فیلد دیدنی شماره‌ای (۱، ۲، …) پیش از برچسبش می‌گیرد؛ مناسب پرسش‌نامه."
        checked={definition.numbered === true}
        error={errors.numbered}
        onChange={(v) => onChange("numbered", v || undefined)}
      />
      <Row id="form-required-mark" label="نشانه‌ی فیلد الزامی" help="«اختیاری روی اختیاری‌ها» برای فرم‌هایی که بیشتر فیلدهایشان الزامی است خواناتر است." error={errors.required_mark}>
        <Select value={definition.required_mark ?? "star"} onValueChange={(v) => onChange("required_mark", v === "star" ? undefined : v)}>
          <SelectTrigger id="form-required-mark" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="star">ستاره (*)</SelectItem>
            <SelectItem value="word">نوشته‌ی «(الزامی)»</SelectItem>
            <SelectItem value="optional">«(اختیاری)» روی فیلدهای اختیاری</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row id="form-submit-label" label="متن دکمه‌ی ثبت" error={errors.submit_label}>
        <Input id="form-submit-label" maxLength={40} placeholder="ثبت نهایی" value={definition.submit_label ?? ""} onChange={(e) => onChange("submit_label", e.target.value || undefined)} />
      </Row>
      <Field data-invalid={!!errors.intro}>
        <div className="flex items-center gap-1">
          <FieldLabel id="form-intro-label">متن آغاز فرم</FieldLabel>
          <InfoTip label="راهنمای متن آغاز فرم">بالای فرم و پیش از نخستین بخش نمایش داده می‌شود؛ مثلاً مدارک لازم یا شرایط.</InfoTip>
        </div>
        <RichTextEditor id="form-intro" value={definition.intro ?? ""} onChange={(v) => onChange("intro", v || undefined)} labelledBy="form-intro-label" invalid={!!errors.intro} />
        {errors.intro && <FieldError>{errors.intro}</FieldError>}
      </Field>
      <Field data-invalid={!!errors.confirmation}>
        <div className="flex items-center gap-1">
          <FieldLabel id="form-confirmation-label">پیام پس از ثبت</FieldLabel>
          <InfoTip label="راهنمای پیام پس از ثبت">
            در «صفحه‌ی تأیید» نمایش داده می‌شود (تنظیمات فرم › پس از ثبت). جای‌گذارها: {"{شماره}"} شماره‌ی ثبت، {"{نام}"} نام ثبت‌کننده، {"{تاریخ}"} زمان ثبت، {"{فرم}"} عنوان فرم.
          </InfoTip>
        </div>
        <RichTextEditor id="form-confirmation" value={definition.confirmation ?? ""} onChange={(v) => onChange("confirmation", v || undefined)} labelledBy="form-confirmation-label" invalid={!!errors.confirmation} />
        {errors.confirmation && <FieldError>{errors.confirmation}</FieldError>}
      </Field>
      <Separator />
    </div>
  )
}
