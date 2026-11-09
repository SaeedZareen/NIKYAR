import { useWatch } from "react-hook-form"
import { FormField, StaticField } from "@/components/form/form-field"
import { JalaliDateInput, MoneyInput, TimeInput } from "@/components/form/inputs"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatNumber, numberToWords, toEnDigits } from "@/lib/format"
import { optionColumnsClass, type ChoiceOption, type FieldDef } from "./definition"
import { common, optionsOf, str, type FieldProps } from "./field-props"

// نوع‌های پایه (3.2): متن، عدد، مبلغ، تاریخ، ساعت و انتخاب‌ها.

export function TextField(p: FieldProps) {
  const maxLength = Number(p.field.props?.max_length ?? 200)
  const placeholder = str(p.field.props?.placeholder) || undefined
  // متن «فقط لاتین» چپ‌به‌راست نوشته می‌شود.
  const latin = p.field.props?.script === "latin"
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => (
        <Input id={id} maxLength={maxLength} placeholder={placeholder} dir={latin ? "ltr" : undefined} className={latin ? "text-start" : undefined} {...field} value={str(field.value)} {...aria} />
      )}
    />
  )
}

export function TextareaField(p: FieldProps) {
  const maxLength = Number(p.field.props?.max_length ?? 2000)
  const rows = Number(p.field.props?.rows ?? 4)
  const placeholder = str(p.field.props?.placeholder) || undefined
  const length = str(useWatch({ control: p.control, name: p.field.id })).length
  return (
    <FormField
      {...common(p)}
      hint={`${formatNumber(length)} از ${formatNumber(maxLength)} نویسه`}
      render={({ field, id, aria }) => <Textarea id={id} rows={rows} maxLength={maxLength} placeholder={placeholder} {...field} value={str(field.value)} {...aria} />}
    />
  )
}

export function NumberField(p: FieldProps) {
  const unit = str(p.field.props?.unit)
  const decimals = Number(p.field.props?.decimals ?? 0)
  // فقط رقم (فارسی هم پذیرفته و لاتین می‌شود)، علامت منفی و در صورت اعشار یک ممیز.
  const normalize = (raw: string) => toEnDigits(raw).replace(/[٫/]/g, ".").replace(decimals ? /[^\d.-]/g : /[^\d-]/g, "")
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => (
        <InputGroup>
          <InputGroupInput
            id={id}
            dir="ltr"
            inputMode={decimals ? "decimal" : "numeric"}
            autoComplete="off"
            className="text-start tabular-nums"
            name={field.name}
            ref={field.ref}
            value={str(field.value)}
            onChange={(e) => field.onChange(normalize(e.target.value))}
            onBlur={field.onBlur}
            {...aria}
          />
          {unit && (
            <InputGroupAddon align="inline-end">
              <InputGroupText>{unit}</InputGroupText>
            </InputGroupAddon>
          )}
        </InputGroup>
      )}
    />
  )
}

export function AmountField(p: FieldProps) {
  const rial = Number(str(useWatch({ control: p.control, name: p.field.id })) || 0)
  // مبلغ به حروف و معادل تومان، مثل نوشتن چک؛ فقط وقتی مبلغی وارد شده است.
  const hint = rial > 0 ? `${numberToWords(rial)} ریال${rial >= 10 ? ` · ${formatNumber(Math.floor(rial / 10))} تومان` : ""}` : undefined
  return <FormField {...common(p)} hint={hint} render={({ field, id, aria }) => <MoneyInput id={id} currency="ریال" {...field} value={str(field.value)} {...aria} />} />
}

export function DateField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => <JalaliDateInput id={id} value={str(field.value)} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
    />
  )
}

export function TimeField(p: FieldProps) {
  return <FormField {...common(p)} render={({ field, id, aria }) => <TimeInput id={id} {...field} value={str(field.value)} {...aria} />} />
}

/** مقدار «سایر»: {other: متن} به‌جای کد یکی از گزینه‌ها (هم‌ارز _with_other سرور). */
type Other = { other: string }
const OTHER = "__other__"
const isOther = (v: unknown): v is Other => typeof v === "object" && v !== null && !Array.isArray(v) && "other" in v
const otherLabel = (field: FieldDef) => str(field.props?.other_label) || "سایر"

/** کادر متن کنار گزینه‌ی «سایر»؛ فقط وقتی آن گزینه انتخاب شده است. */
function OtherInput({ id, field, value, onChange, onBlur }: { id: string; field: FieldDef; value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <Input id={id} aria-label={`${otherLabel(field)} (${field.label ?? ""})`} maxLength={200} className="h-7 w-48 max-w-full" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
  )
}

export function RadioField({ options, ...p }: FieldProps & { options: ChoiceOption[] }) {
  const allowOther = p.field.props?.allow_other === true
  return (
    <FormField
      {...common(p)}
      group
      render={({ field, id, aria }) => {
        const other = isOther(field.value) ? field.value.other : undefined
        return (
          <RadioGroup
            id={id}
            tabIndex={-1}
            value={other !== undefined ? OTHER : str(field.value)}
            onValueChange={(v) => field.onChange(v === OTHER ? { other: "" } : v)}
            className={cn("min-h-7", optionColumnsClass(p.field.props?.option_columns))}
            {...aria}
          >
            {options.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <RadioGroupItem value={o.value} id={`${id}-${o.value}`} onBlur={field.onBlur} />
                <Label htmlFor={`${id}-${o.value}`} className="font-normal">
                  {o.label}
                </Label>
              </div>
            ))}
            {allowOther && (
              <div className="flex flex-wrap items-center gap-2">
                <RadioGroupItem value={OTHER} id={`${id}-${OTHER}`} onBlur={field.onBlur} />
                <Label htmlFor={`${id}-${OTHER}`} className="font-normal">
                  {otherLabel(p.field)}
                </Label>
                {other !== undefined && <OtherInput id={`${id}-other-text`} field={p.field} value={other} onChange={(v) => field.onChange({ other: v })} onBlur={field.onBlur} />}
              </div>
            )}
          </RadioGroup>
        )
      }}
    />
  )
}

const YES_NO: ChoiceOption[] = [
  { value: "true", label: "بله" },
  { value: "false", label: "خیر" },
]

export function BooleanField(p: FieldProps) {
  return <RadioField {...p} options={YES_NO} />
}

export function ChoiceField(p: FieldProps) {
  const options = optionsOf(p.field)
  if (p.field.props?.display !== "select") return <RadioField {...p} options={options} />
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => {
        const other = isOther(field.value) ? field.value.other : undefined
        return (
          <div className="flex flex-col gap-1.5">
            <Select value={other !== undefined ? OTHER : str(field.value)} onValueChange={(v) => field.onChange(v === OTHER ? { other: "" } : v)}>
              <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
                <SelectValue placeholder="انتخاب کنید" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
                {p.field.props?.allow_other === true && <SelectItem value={OTHER}>{otherLabel(p.field)}</SelectItem>}
              </SelectContent>
            </Select>
            {other !== undefined && <OtherInput id={`${id}-other-text`} field={p.field} value={other} onChange={(v) => field.onChange({ other: v })} onBlur={field.onBlur} />}
          </div>
        )
      }}
    />
  )
}

export function MultiChoiceField(p: FieldProps) {
  const options = optionsOf(p.field)
  return (
    <FormField
      {...common(p)}
      group
      render={({ field, id, aria: { "aria-required": _required, ...aria } }) => {
        // role=group خصیصه‌ی aria-required نمی‌پذیرد.
        const items = Array.isArray(field.value) ? (field.value as (string | Other)[]) : []
        const selected = items.filter((v): v is string => typeof v === "string")
        const other = items.find(isOther)
        // ترتیب انتخاب‌ها همان ترتیب گزینه‌ها می‌ماند و «سایر» در پایان.
        const change = (codes: string[], next: Other | undefined) => field.onChange([...options.map((o) => o.value).filter((v) => codes.includes(v)), ...(next ? [next] : [])])
        const toggle = (value: string, on: boolean) => change(on ? [...selected, value] : selected.filter((v) => v !== value), other)
        return (
          <div id={id} role="group" tabIndex={-1} className={cn("min-h-7 outline-none", optionColumnsClass(p.field.props?.option_columns))} {...aria}>
            {options.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <Checkbox id={`${id}-${o.value}`} checked={selected.includes(o.value)} onCheckedChange={(c) => toggle(o.value, c === true)} onBlur={field.onBlur} />
                <Label htmlFor={`${id}-${o.value}`} className="font-normal">
                  {o.label}
                </Label>
              </div>
            ))}
            {p.field.props?.allow_other === true && (
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox id={`${id}-${OTHER}`} checked={other !== undefined} onCheckedChange={(c) => change(selected, c === true ? { other: "" } : undefined)} onBlur={field.onBlur} />
                <Label htmlFor={`${id}-${OTHER}`} className="font-normal">
                  {otherLabel(p.field)}
                </Label>
                {other && <OtherInput id={`${id}-other-text`} field={p.field} value={other.other} onChange={(v) => change(selected, { other: v })} onBlur={field.onBlur} />}
              </div>
            )}
          </div>
        )
      }}
    />
  )
}


/** فیلد محاسبه‌ای: نتیجه‌ی فرمول، فقط‌خواندنی و زنده؛ تا ورودی‌های فرمول پر نشده‌اند «—». */
export function CalculatedField({ field, value, className, layout }: { field: FieldDef; value?: number; className?: string; layout?: "side" | "stacked" }) {
  const format = field.props?.format
  const unit = format === "amount" ? "ریال" : format === "days" ? "روز" : str(field.props?.unit)
  return (
    <StaticField label={field.label ?? ""} className={className} layout={layout}>
      <output className="flex min-h-7 items-center text-xs font-medium tabular-nums" aria-live="polite">
        {value === undefined ? "—" : `${formatNumber(value)}${unit ? ` ${unit}` : ""}`}
      </output>
    </StaticField>
  )
}
