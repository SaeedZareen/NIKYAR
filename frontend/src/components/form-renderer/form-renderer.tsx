import * as React from "react"
import type { Control } from "react-hook-form"
import { FormGrid } from "@/components/form/form-grid"
import { Section } from "@/components/layout/section"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { AmountField, BooleanField, CalculatedField, ChoiceField, DateField, MultiChoiceField, NumberField, TextareaField, TextField, TimeField } from "./basic-fields"
import { labelLayout, spanClass, type FieldType, type FormDefinition, type FormValues } from "./definition"
import type { FieldProps } from "./field-props"
import type { RuleState } from "./rules"
import {
  CardField,
  ConsentField,
  DateRangeField,
  DateTimeField,
  DigitsField,
  EmailField,
  IbanField,
  MatrixField,
  PlateField,
  ScaleField,
  TimeRangeField,
} from "./special-fields"
import {
  AttachmentField,
  LookupField,
  OrgUnitField,
  PositionField,
  RegionField,
  SignatureField,
  SignaturePadField,
  SubmitterField,
  UserField,
} from "./system-fields"

type Props = {
  definition: FormDefinition
  /** عنوان فرم؛ برای بخش بی‌عنوان. */
  title: string
  control: Control<FormValues>
  /** پانویس بخش آخر (دکمه‌های ثبت). */
  footer?: React.ReactNode
  /** نتیجه‌ی قاعده‌ها برای داده‌ی فعلی (پنهان، فقط‌خواندنی، محاسبه‌ها)؛ بدون آن همه‌ی فیلدها دیده می‌شوند (مثل بوم طراح). */
  rules?: RuleState
}

const RulesContext = React.createContext<RuleState | undefined>(undefined)

/**
 * نمایشگر فرم فرم‌ساز: هر بخش تعریف یک Section و هر فیلد یک FormField کیت؛ پس فرم ساخته‌شده همان ظاهر
 * فرم‌های دست‌ساز سامانه را دارد (برچسب کنار فیلد، راهنمای ⓘ، خطای زیر فیلد).
 */
export function FormRenderer({ definition, title, control, footer, rules }: Props) {
  const sections = definition.sections.filter((s) => !rules?.hiddenSections.has(s.id))
  return (
    <RulesContext.Provider value={rules}>
      {sections.map((section, i) => {
        const columns = Math.min(Math.max(section.columns ?? 1, 1), 3) as 1 | 2 | 3
        return (
          <Section key={section.id} title={section.title || title} description={section.help || undefined} footer={i === sections.length - 1 ? footer : undefined}>
            <FormGrid columns={columns} fixed>
              {section.fields.map((field) => (
                <FieldView key={field.id} field={field} control={control} className={spanClass(field, columns)} layout={labelLayout(section)} />
              ))}
            </FormGrid>
          </Section>
        )
      })}
    </RulesContext.Provider>
  )
}

/** یک فیلد تعریف (نمایشی یا دارای مقدار) با کنترل همان نوع؛ طراح هم برای پیش‌نمایش زنده از آن استفاده می‌کند. */
export function FieldView({ field, control, className, layout }: FieldProps) {
  const rules = React.useContext(RulesContext)
  const props = field.props ?? {}
  if (rules?.hidden.has(field.id)) return null
  if (field.type === "heading") return <h3 className={cn("col-span-full border-b pb-1 text-xs font-semibold", className)}>{field.label}</h3>
  if (field.type === "paragraph") return <p className="col-span-full text-xs whitespace-pre-line">{String(props.content ?? "")}</p>
  if (field.type === "divider") return <Separator className="col-span-full" />
  if (field.type === "calculated") return <CalculatedField field={field} value={rules?.calculated[field.id]} className={className} layout={layout} />
  const Renderer = CONTROLS[field.type]
  if (!Renderer) return null
  const view = <Renderer field={field} control={control} className={className} layout={layout} />
  // فقط‌خواندنی شرطی: همه‌ی کنترل‌های فیلد غیرفعال، بی‌آنکه چیدمان شبکه عوض شود.
  return rules?.readonly.has(field.id) ? (
    <fieldset disabled className="contents">
      {view}
    </fieldset>
  ) : (
    view
  )
}

/** کنترل هر نوع دارای مقدار (جدول در 3.6 اضافه می‌شود). */
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
  date_range: DateRangeField,
  datetime: DateTimeField,
  time_range: TimeRangeField,
  national_code: DigitsField,
  legal_national_id: DigitsField,
  economic_code: DigitsField,
  registration_number: DigitsField,
  mobile: DigitsField,
  phone: DigitsField,
  postal_code: DigitsField,
  card_number: CardField,
  iban: IbanField,
  email: EmailField,
  vehicle_plate: PlateField,
  scale: ScaleField,
  matrix: MatrixField,
  consent: ConsentField,
  lookup: LookupField,
  user: UserField,
  org_unit: OrgUnitField,
  position: PositionField,
  region: RegionField,
  submitter: SubmitterField,
  attachment: AttachmentField,
  signature: SignatureField,
  signature_pad: SignaturePadField,
}
