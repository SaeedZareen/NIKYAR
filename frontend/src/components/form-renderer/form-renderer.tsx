import type * as React from "react"
import { useWatch, type Control } from "react-hook-form"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { JalaliDateInput, MoneyInput, TimeInput } from "@/components/form/inputs"
import { Section } from "@/components/layout/section"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber, toEnDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { spanClass, type ChoiceOption, type FieldDef, type FieldType, type FormDefinition, type FormValues } from "./definition"

type Props = {
  definition: FormDefinition
  /** عنوان فرم؛ برای بخش بی‌عنوان. */
  title: string
  control: Control<FormValues>
  /** پانویس بخش آخر (دکمه‌های ثبت). */
  footer?: React.ReactNode
}

/**
 * نمایشگر فرم فرم‌ساز: هر بخش تعریف یک Section و هر فیلد یک FormField کیت؛ پس فرم ساخته‌شده همان ظاهر
 * فرم‌های دست‌ساز سامانه را دارد (برچسب کنار فیلد، راهنمای ⓘ، خطای زیر فیلد).
 */
export function FormRenderer({ definition, title, control, footer }: Props) {
  const sections = definition.sections
  return (
    <>
      {sections.map((section, i) => {
        const columns = Math.min(Math.max(section.columns ?? 1, 1), 3) as 1 | 2 | 3
        return (
          <Section key={section.id} title={section.title || title} description={section.help || undefined} footer={i === sections.length - 1 ? footer : undefined}>
            <FormGrid columns={columns}>
              {section.fields.map((field) => (
                <FieldView key={field.id} field={field} control={control} className={spanClass(field.span, columns)} />
              ))}
            </FormGrid>
          </Section>
        )
      })}
    </>
  )
}

type FieldProps = { field: FieldDef; control: Control<FormValues>; className?: string }

function FieldView({ field, control, className }: FieldProps) {
  const props = field.props ?? {}
  if (field.type === "heading") return <h3 className={cn("col-span-full border-b pb-1 text-xs font-semibold", className)}>{field.label}</h3>
  if (field.type === "paragraph") return <p className="col-span-full text-xs whitespace-pre-line">{String(props.content ?? "")}</p>
  if (field.type === "divider") return <Separator className="col-span-full" />
  const Renderer = CONTROLS[field.type]
  if (!Renderer) return null
  return <Renderer field={field} control={control} className={className} />
}

/** ویژگی مشترک FormField هر فیلد. */
function common({ field, control, className }: FieldProps) {
  return { control, name: field.id, label: field.label ?? "", required: field.required, description: field.help || undefined, className }
}

const optionsOf = (field: FieldDef) => (field.props?.options ?? []) as ChoiceOption[]
const str = (value: unknown) => (typeof value === "string" ? value : "")

function TextField(p: FieldProps) {
  const maxLength = Number(p.field.props?.max_length ?? 200)
  const placeholder = str(p.field.props?.placeholder) || undefined
  return <FormField {...common(p)} render={({ field, id, aria }) => <Input id={id} maxLength={maxLength} placeholder={placeholder} {...field} value={str(field.value)} {...aria} />} />
}

function TextareaField(p: FieldProps) {
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

function NumberField(p: FieldProps) {
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

function AmountField(p: FieldProps) {
  return <FormField {...common(p)} render={({ field, id, aria }) => <MoneyInput id={id} currency="ریال" {...field} value={str(field.value)} {...aria} />} />
}

function DateField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => <JalaliDateInput id={id} value={str(field.value)} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
    />
  )
}

function TimeField(p: FieldProps) {
  return <FormField {...common(p)} render={({ field, id, aria }) => <TimeInput id={id} {...field} value={str(field.value)} {...aria} />} />
}

function RadioField({ options, ...p }: FieldProps & { options: ChoiceOption[] }) {
  return (
    <FormField
      {...common(p)}
      group
      render={({ field, id, aria }) => (
        <RadioGroup id={id} tabIndex={-1} value={str(field.value)} onValueChange={field.onChange} className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-2" {...aria}>
          {options.map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <RadioGroupItem value={o.value} id={`${id}-${o.value}`} onBlur={field.onBlur} />
              <Label htmlFor={`${id}-${o.value}`} className="font-normal">
                {o.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}
    />
  )
}

const YES_NO: ChoiceOption[] = [
  { value: "true", label: "بله" },
  { value: "false", label: "خیر" },
]

function BooleanField(p: FieldProps) {
  return <RadioField {...p} options={YES_NO} />
}

function ChoiceField(p: FieldProps) {
  const options = optionsOf(p.field)
  if (p.field.props?.display !== "select") return <RadioField {...p} options={options} />
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => (
        <Select value={str(field.value)} onValueChange={field.onChange}>
          <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
            <SelectValue placeholder="انتخاب کنید" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )
}

function MultiChoiceField(p: FieldProps) {
  const options = optionsOf(p.field)
  return (
    <FormField
      {...common(p)}
      group
      render={({ field, id, aria }) => {
        const selected = Array.isArray(field.value) ? (field.value as string[]) : []
        // ترتیب انتخاب‌ها همان ترتیب گزینه‌ها می‌ماند.
        const toggle = (value: string, on: boolean) => field.onChange(options.map((o) => o.value).filter((v) => (v === value ? on : selected.includes(v))))
        return (
          <div id={id} role="group" tabIndex={-1} className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-2 outline-none" {...aria}>
            {options.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <Checkbox id={`${id}-${o.value}`} checked={selected.includes(o.value)} onCheckedChange={(c) => toggle(o.value, c === true)} onBlur={field.onBlur} />
                <Label htmlFor={`${id}-${o.value}`} className="font-normal">
                  {o.label}
                </Label>
              </div>
            ))}
          </div>
        )
      }}
    />
  )
}

/** کنترل هر نوع دارای مقدار؛ نوع‌های پیشرفته (شناسه‌ها، داده‌های سامانه، پیوست، امضا، بازه‌ی تاریخ) در 3.3 و جدول در 3.6 اضافه می‌شوند. */
const CONTROLS: Partial<Record<FieldType, (p: FieldProps) => React.ReactNode>> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  amount: AmountField,
  date: DateField,
  time: TimeField,
  boolean: BooleanField,
  choice: ChoiceField,
  multi_choice: MultiChoiceField,
}
