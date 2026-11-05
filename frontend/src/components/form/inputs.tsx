// کنترل‌های ورودی ویژه‌ی داده‌های ایرانی. مقدار همیشه یکسان‌سازی‌شده (ارقام لاتین) است.
// این فیلدها متن راهنما (placeholder) ندارند: نمونه‌ی خاکستری با مقدار واقعی اشتباه گرفته می‌شود
// و متن فارسی در فیلد چپ‌به‌راست وارونه نمایش داده می‌شود. راهنما در description فیلد می‌آید.
import * as React from "react"
import { CalendarDays } from "lucide-react"
import { getMonth, getYear } from "date-fns-jalali"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { JalaliCalendar, type JalaliCalendarProps } from "@/components/jalali-calendar"
import { formatDate, onlyDigits, parseJalali, toJalaliString } from "@/lib/format"
import { cn } from "@/lib/utils"

type BaseProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value?: string | null
  onChange: (value: string) => void
}

const DIGIT_KINDS = {
  nationalId: { maxLength: 10, autoComplete: "off" },
  legalNationalId: { maxLength: 11, autoComplete: "off" },
  economicCode: { maxLength: 12, autoComplete: "off" },
  registrationNumber: { maxLength: 20, autoComplete: "off" },
  mobile: { maxLength: 11, autoComplete: "tel" },
  phone: { maxLength: 11, autoComplete: "tel" },
  postalCode: { maxLength: 10, autoComplete: "postal-code" },
  cardNumber: { maxLength: 16, autoComplete: "cc-number" },
} as const

/** ورودی رقمی چپ‌به‌راست (کد ملی، شناسه‌ی ملی، موبایل، تلفن، کد پستی، کارت)؛ ارقام فارسی را می‌پذیرد. */
export function DigitsInput({ kind, value, onChange, className, ...props }: BaseProps & { kind: keyof typeof DIGIT_KINDS }) {
  const k = DIGIT_KINDS[kind]
  return (
    <Input
      dir="ltr"
      inputMode="numeric"
      autoComplete={k.autoComplete}
      value={value ?? ""}
      onChange={(e) => onChange(onlyDigits(e.target.value).slice(0, k.maxLength))}
      className={cn("text-start tabular-nums", className)}
      {...props}
    />
  )
}

/** شبا: پیشوند ثابت IR و ۲۴ رقم. مقدار خروجی کامل است (IR…). */
export function IbanInput({ value, onChange, className, ...props }: BaseProps) {
  const digits = (value ?? "").replace(/^IR/i, "")
  return (
    <InputGroup dir="ltr" className={className}>
      <InputGroupAddon>
        <InputGroupText>IR</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="numeric"
        autoComplete="off"
        value={digits}
        onChange={(e) => {
          const d = onlyDigits(e.target.value).slice(0, 24)
          onChange(d ? `IR${d}` : "")
        }}
        className="tabular-nums"
        {...props}
      />
    </InputGroup>
  )
}

/** مبلغ به تومان با جداکننده‌ی هزارگان هنگام تایپ. مقدار خروجی رشته‌ی رقمی است. */
export function MoneyInput({ value, onChange, className, ...props }: BaseProps) {
  const digits = onlyDigits(value ?? "")
  return (
    <InputGroup className={className}>
      <InputGroupInput
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        value={digits ? Number(digits).toLocaleString("en-US") : ""}
        onChange={(e) => onChange(onlyDigits(e.target.value).replace(/^0+(?=\d)/, "").slice(0, 15))}
        className="text-start tabular-nums"
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>تومان</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

type DateProps = {
  id?: string
  value?: string | null
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  className?: string
  /** بازه‌ی مجاز سال‌ها در تقویم. */
  fromYear?: number
  toYear?: number
} & Pick<React.AriaAttributes, "aria-invalid" | "aria-describedby" | "aria-required">

type JalaliMonth = NonNullable<JalaliCalendarProps["visibleMonth"]>

/** «14050814» ← «1405/08/14»: هنگام تایپ، خط‌های جداکننده خودکار گذاشته می‌شوند. */
function maskJalali(input: string): string {
  const d = onlyDigits(input).slice(0, 8)
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join("/")
}

/**
 * تاریخ شمسی: تایپ مستقیم (برای ورود سریع داده) یا انتخاب از تقویم آوان.
 * مقدار: رشته‌ی «1405/08/14»؛ درستی آن با schemas.jalaliDate بررسی می‌شود.
 */
export function JalaliDateInput({ id, value, onChange, onBlur, disabled, className, fromYear, toYear, ...aria }: DateProps) {
  const [open, setOpen] = React.useState(false)
  const [visibleMonth, setVisibleMonth] = React.useState<JalaliMonth>()
  const date = parseJalali(value)
  const minDate = fromYear ? parseJalali(`${fromYear}/01/01`) : undefined
  const maxDate = toYear ? parseJalali(`${toYear}/12/29`) : undefined

  // تقویم روی ماه تاریخ واردشده باز می‌شود؛ اگر خالی است، روی امروز (یا نزدیک‌ترین ماه مجاز).
  const onOpenChange = (next: boolean) => {
    if (next) {
      const today = new Date()
      const target = date ?? (maxDate && today > maxDate ? maxDate : minDate && today < minDate ? minDate : today)
      setVisibleMonth({ year: getYear(target), month: getMonth(target) + 1, day: 1 })
    }
    setOpen(next)
  }
  return (
    <InputGroup className={className} data-disabled={disabled}>
      <InputGroupInput
        id={id}
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(maskJalali(e.target.value))}
        onBlur={onBlur}
        className="text-start tabular-nums"
        {...aria}
      />
      <InputGroupAddon align="inline-end">
        {date && <InputGroupText>{formatDate(date, "weekday")}</InputGroupText>}
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <InputGroupButton size="icon-xs" aria-label="انتخاب از تقویم" disabled={disabled}>
              <CalendarDays />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent className="max-h-(--radix-popover-content-available-height) w-80 overflow-y-auto p-0" align="end">
            <JalaliCalendar
              value={date ?? null}
              visibleMonth={visibleMonth}
              onVisibleMonthChange={setVisibleMonth}
              minDate={minDate}
              maxDate={maxDate}
              showTodayButton
              showClearButton
              onChange={(d) => {
                onChange(toJalaliString(d))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  )
}
