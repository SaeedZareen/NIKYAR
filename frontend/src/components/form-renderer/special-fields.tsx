import { useWatch } from "react-hook-form"
import { Star } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { FormField } from "@/components/form/form-field"
import { DigitsInput, IbanInput, JalaliDateInput, PlateInput, TimeInput } from "@/components/form/inputs"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { bankFromCard, bankFromIban } from "@/lib/banks"
import { formatDuration, formatNumber, parseJalali, toFaDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { common, optionsOf, str, type FieldProps } from "./field-props"

// نوع‌های تخصصی (3.3a): شناسه‌های ایرانی، تاریخ و زمان ترکیبی، طیف امتیاز، ماتریس ارزیابی و تعهد.

type Range = { start?: string; end?: string }
const range = (value: unknown): Range => (value && typeof value === "object" ? (value as Range) : {})
const useValue = (p: FieldProps) => useWatch({ control: p.control, name: p.field.id })

const DIGIT_KINDS = {
  national_code: "nationalId",
  legal_national_id: "legalNationalId",
  economic_code: "economicCode",
  registration_number: "registrationNumber",
  mobile: "mobile",
  phone: "phone",
  postal_code: "postalCode",
} as const

/** شناسه‌های رقمی (کد ملی، شناسه‌ی ملی، کد اقتصادی، شماره‌ی ثبت، موبایل، تلفن، کد پستی). */
export function DigitsField(p: FieldProps) {
  const kind = DIGIT_KINDS[p.field.type as keyof typeof DIGIT_KINDS]
  return <FormField {...common(p)} render={({ field, id, aria }) => <DigitsInput kind={kind} id={id} {...field} value={str(field.value)} {...aria} />} />
}

export function CardField(p: FieldProps) {
  const bank = bankFromCard(str(useValue(p)))
  return (
    <FormField
      {...common(p)}
      hint={bank}
      render={({ field, id, aria }) => <DigitsInput kind="cardNumber" id={id} {...field} value={str(field.value)} {...aria} />}
    />
  )
}

export function IbanField(p: FieldProps) {
  const bank = bankFromIban(str(useValue(p)))
  return <FormField {...common(p)} hint={bank} render={({ field, id, aria }) => <IbanInput id={id} {...field} value={str(field.value)} {...aria} />} />
}

export function EmailField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => <Input id={id} type="email" dir="ltr" autoComplete="email" className="text-start" {...field} value={str(field.value)} {...aria} />}
    />
  )
}

export function PlateField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => <PlateInput id={id} value={str(field.value)} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
    />
  )
}

/** دو کنترل کنار هم با برچسب کوچک «از» و «تا»؛ کنترل دوم نام دسترس‌پذیر خودش را دارد. */
function Pair({ from, to }: { from: React.ReactNode; to: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {/* هر برچسب کنار کنترل خودش می‌ماند؛ در فضای باریک دو جفت زیر هم می‌آیند */}
      <div className="flex items-center gap-2">
        <span className="w-4 text-2xs text-muted-foreground">از</span>
        {from}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-4 text-2xs text-muted-foreground">تا</span>
        {to}
      </div>
    </div>
  )
}

export function DateRangeField(p: FieldProps) {
  const { start, end } = range(useValue(p))
  const s = parseJalali(start)
  const e = parseJalali(end)
  const days = s && e && e >= s ? Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1 : undefined
  return (
    <FormField
      {...common(p)}
      hint={days ? `${formatNumber(days)} روز` : undefined}
      render={({ field, id, aria }) => {
        const v = range(field.value)
        return (
          <Pair
            from={<JalaliDateInput id={id} className="w-44" value={v.start ?? ""} onChange={(x) => field.onChange({ ...v, start: x })} onBlur={field.onBlur} {...aria} />}
            to={
              <JalaliDateInput
                className="w-44"
                value={v.end ?? ""}
                onChange={(x) => field.onChange({ ...v, end: x })}
                onBlur={field.onBlur}
                aria-label={`${p.field.label} — تا تاریخ`}
                aria-invalid={aria["aria-invalid"]}
              />
            }
          />
        )
      }}
    />
  )
}

export function DateTimeField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => {
        const [date = "", time = ""] = str(field.value).split(" ")
        const set = (d: string, t: string) => field.onChange([d, t].filter(Boolean).join(" "))
        return (
          <div className="flex flex-wrap items-center gap-2">
            <JalaliDateInput id={id} className="w-44" value={date} onChange={(d) => set(d, time)} onBlur={field.onBlur} {...aria} />
            <TimeInput value={time} onChange={(t) => set(date, t)} onBlur={field.onBlur} aria-label={`${p.field.label} — ساعت`} aria-invalid={aria["aria-invalid"]} />
          </div>
        )
      }}
    />
  )
}

const minutes = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : undefined)

export function TimeRangeField(p: FieldProps) {
  const { start, end } = range(useValue(p))
  const a = minutes(start)
  const b = minutes(end)
  const overnight = p.field.props?.overnight === true
  const duration = a !== undefined && b !== undefined && a !== b && (overnight || b > a) ? (b - a + 1440) % 1440 : undefined
  return (
    <FormField
      {...common(p)}
      hint={duration ? `مدت: ${formatDuration(duration)}` : undefined}
      render={({ field, id, aria }) => {
        const v = range(field.value)
        return (
          <Pair
            from={<TimeInput id={id} value={v.start ?? ""} onChange={(x) => field.onChange({ ...v, start: x })} onBlur={field.onBlur} {...aria} />}
            to={
              <TimeInput
                value={v.end ?? ""}
                onChange={(x) => field.onChange({ ...v, end: x })}
                onBlur={field.onBlur}
                aria-label={`${p.field.label} — تا ساعت`}
                aria-invalid={aria["aria-invalid"]}
              />
            }
          />
        )
      }}
    />
  )
}

/** طیف امتیاز: دکمه‌های عدد یا ستاره، با برچسب دو سر طیف. */
export function ScaleField(p: FieldProps) {
  const props = p.field.props ?? {}
  const min = Number(props.min ?? 1)
  const max = Number(props.max ?? 5)
  const stars = props.display === "stars"
  const values = Array.from({ length: max - min + 1 }, (_, i) => String(min + i))
  return (
    <FormField
      {...common(p)}
      group
      render={({ field, id, aria }) => {
        const current = Number(str(field.value) || 0)
        return (
          <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
            {str(props.min_label) && <span className="text-2xs text-muted-foreground">{str(props.min_label)}</span>}
            <RadioGroupPrimitive.Root id={id} tabIndex={-1} dir="rtl" value={str(field.value)} onValueChange={field.onChange} className="flex items-center gap-1" {...aria}>
              {values.map((v) => (
                <RadioGroupPrimitive.Item
                  key={v}
                  value={v}
                  onBlur={field.onBlur}
                  aria-label={`${toFaDigits(v)} از ${toFaDigits(max)}`}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-xs tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    stars ? "text-muted-foreground" : "border border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  )}
                >
                  {stars ? <Star className={cn("size-5", Number(v) <= current && "fill-warning text-warning")} aria-hidden /> : toFaDigits(v)}
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroupPrimitive.Root>
            {str(props.max_label) && <span className="text-2xs text-muted-foreground">{str(props.max_label)}</span>}
          </div>
        )
      }}
    />
  )
}

/** ماتریس ارزیابی: هر معیار یک گروه رادیویی با همان گزینه‌ها؛ روی صفحه‌ی پهن به شکل جدول با سربرگ گزینه‌ها. */
export function MatrixField(p: FieldProps) {
  const rows = optionsOf(p.field, "rows")
  const columns = optionsOf(p.field, "columns")
  const grid = { gridTemplateColumns: `minmax(8rem, 1fr) repeat(${columns.length}, minmax(3.5rem, auto))` }
  return (
    <FormField
      {...common(p)}
      className={cn(p.className, "col-span-full")}
      layout="stacked"
      group
      render={({ field, id, aria: { "aria-required": _required, ...aria } }) => {
        // role=group خصیصه‌ی aria-required نمی‌پذیرد؛ الزامی بودن با ستاره و پیام خطا اعلام می‌شود.
        const answers = (field.value && typeof field.value === "object" ? field.value : {}) as Record<string, string>
        return (
          <div id={id} role="group" tabIndex={-1} className="@container rounded-md border outline-none" {...aria}>
            <div className="hidden items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-2xs text-muted-foreground @2xl:grid" style={grid} aria-hidden>
              <span />
              {columns.map((c) => (
                <span key={c.value} className="text-center">
                  {c.label}
                </span>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.value} className="flex flex-col gap-1.5 border-b px-3 py-2 last:border-b-0 @2xl:grid @2xl:items-center @2xl:gap-2" style={grid}>
                <span id={`${id}-${r.value}`} className="text-xs">
                  {r.label}
                </span>
                <RadioGroup
                  aria-labelledby={`${id}-${r.value}`}
                  value={answers[r.value] ?? ""}
                  onValueChange={(v) => field.onChange({ ...answers, [r.value]: v })}
                  className="flex flex-wrap gap-x-4 gap-y-1.5 @2xl:contents"
                >
                  {columns.map((c) => (
                    <div key={c.value} className="flex items-center gap-2 @2xl:justify-center">
                      <RadioGroupItem value={c.value} id={`${id}-${r.value}-${c.value}`} onBlur={field.onBlur} aria-label={`${r.label}: ${c.label}`} />
                      <Label htmlFor={`${id}-${r.value}-${c.value}`} className="font-normal @2xl:sr-only">
                        {c.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
        )
      }}
    />
  )
}

/** تأیید و تعهد: یک چک‌باکس با متن تعهد؛ «الزامی» یعنی باید پذیرفته شود. */
export function ConsentField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      className={cn(p.className, "col-span-full")}
      render={({ field, id, aria }) => (
        <div className="flex min-h-7 items-start gap-2 pt-1">
          <Checkbox id={id} checked={field.value === true} onCheckedChange={(c) => field.onChange(c === true)} onBlur={field.onBlur} {...aria} />
          <Label htmlFor={id} className="text-xs font-normal leading-relaxed">
            {str(p.field.props?.text)}
          </Label>
        </div>
      )}
    />
  )
}
