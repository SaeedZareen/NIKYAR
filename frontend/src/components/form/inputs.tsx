// کنترل‌های ورودی ویژه‌ی داده‌های ایرانی. مقدار همیشه یکسان‌سازی‌شده (ارقام لاتین) است.
// متن راهنمای فیلدهای چپ‌به‌راست لاتین است؛ متن فارسی در این فیلدها وارونه نمایش داده می‌شود.
import * as React from "react"
import { CalendarDays, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDate, onlyDigits, parseJalali, toJalaliString } from "@/lib/format"
import { cn } from "@/lib/utils"

type BaseProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value?: string | null
  onChange: (value: string) => void
}

const DIGIT_KINDS = {
  nationalId: { maxLength: 10, placeholder: undefined, autoComplete: "off" },
  mobile: { maxLength: 11, placeholder: "09123456789", autoComplete: "tel" },
  phone: { maxLength: 11, placeholder: "02112345678", autoComplete: "tel" },
  postalCode: { maxLength: 10, placeholder: undefined, autoComplete: "postal-code" },
  cardNumber: { maxLength: 16, placeholder: undefined, autoComplete: "cc-number" },
} as const

/** ورودی رقمی چپ‌به‌راست (کد ملی، موبایل، کد پستی، کارت)؛ ارقام فارسی را می‌پذیرد. */
export function DigitsInput({ kind, value, onChange, className, ...props }: BaseProps & { kind: keyof typeof DIGIT_KINDS }) {
  const k = DIGIT_KINDS[kind]
  return (
    <Input
      dir="ltr"
      inputMode="numeric"
      autoComplete={k.autoComplete}
      placeholder={k.placeholder}
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
  placeholder?: string
  disabled?: boolean
  className?: string
  /** بازه‌ی مجاز سال‌ها در فهرست کشویی تقویم. */
  fromYear?: number
  toYear?: number
} & Pick<React.AriaAttributes, "aria-invalid" | "aria-describedby">

/** انتخاب تاریخ شمسی. مقدار: رشته‌ی «1405/08/14». */
// aria-required روی دکمه مجاز نیست؛ الزامی بودن با ستاره‌ی برچسب و پیام خطا اعلام می‌شود و اینجا کنار گذاشته می‌شود.
export function JalaliDateInput({ id, value, onChange, placeholder = "انتخاب تاریخ", disabled, className, fromYear, toYear, "aria-required": _required, ...aria }: DateProps & { "aria-required"?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const date = parseJalali(value)
  return (
    <InputGroup className={cn("w-full sm:w-56", className)} data-disabled={disabled}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn("flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-start text-xs outline-none", !date && "text-muted-foreground")}
            {...aria}
          >
            <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{date ? formatDate(date, "full") : placeholder}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            captionLayout="dropdown"
            startMonth={fromYear ? parseJalali(`${fromYear}/01/01`) : undefined}
            endMonth={toYear ? parseJalali(`${toYear}/12/29`) : undefined}
            onSelect={(d) => {
              onChange(toJalaliString(d))
              setOpen(false)
            }}
          />
          <div className="flex justify-between gap-2 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(toJalaliString(new Date()))
                setOpen(false)
              }}
            >
              امروز
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {date && !disabled && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="پاک‌کردن تاریخ" onClick={() => onChange("")}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
