// اعتبارسنجی شناسه‌های ایرانی و طرح‌های zod با پیام فارسی.
// ورودی‌ها پیش از بررسی یکسان‌سازی می‌شوند (ارقام فارسی/عربی، فاصله و خط تیره).
import { z } from "zod"
import { onlyDigits, parseJalali, toEnDigits } from "@/lib/format"

/** کد ملی ده‌رقمی با رقم کنترل (پیمانه‌ی ۱۱). */
export function isValidNationalId(value: string): boolean {
  const code = onlyDigits(value)
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false
  const sum = [...code.slice(0, 9)].reduce((acc, d, i) => acc + Number(d) * (10 - i), 0)
  const rem = sum % 11
  const check = Number(code[9])
  return rem < 2 ? check === rem : check === 11 - rem
}

/** شناسه‌ی ملی اشخاص حقوقی: ۱۱ رقم با رقم کنترل (هم‌ارز validate_legal_national_id سرور). */
export function isValidLegalNationalId(value: string): boolean {
  const d = onlyDigits(value)
  if (!/^\d{11}$/.test(d) || Number(d.slice(3, 9)) === 0) return false
  const dec = Number(d[9]) + 2
  const coefficients = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17]
  const sum = coefficients.reduce((acc, c, i) => acc + (Number(d[i]) + dec) * c, 0)
  return (sum % 11) % 10 === Number(d[10])
}

/** تلفن ثابت با پیش‌شماره‌ی شهر: ۱۱ رقم که با ۰ شروع می‌شود. */
export function isValidPhone(value: string): boolean {
  return /^0\d{10}$/.test(onlyDigits(value))
}

/** موبایل یازده‌رقمی که با ۰۹ شروع می‌شود (پیش‌شماره‌ی +۹۸ پذیرفته می‌شود). */
export function normalizeMobile(value: string): string {
  const d = onlyDigits(value)
  if (d.startsWith("98") && d.length === 12) return `0${d.slice(2)}`
  if (d.startsWith("9") && d.length === 10) return `0${d}`
  return d
}
export function isValidMobile(value: string): boolean {
  return /^09\d{9}$/.test(normalizeMobile(value))
}

/** کد پستی ده‌رقمی. */
export function isValidPostalCode(value: string): boolean {
  return /^\d{10}$/.test(onlyDigits(value))
}

/** شماره‌ی کارت شانزده‌رقمی با الگوریتم لون. */
export function isValidCardNumber(value: string): boolean {
  const card = onlyDigits(value)
  if (!/^\d{16}$/.test(card)) return false
  const sum = [...card].reduce((acc, ch, i) => {
    let n = Number(ch)
    if (i % 2 === 0) {
      n *= 2
      if (n > 9) n -= 9
    }
    return acc + n
  }, 0)
  return sum % 10 === 0
}

/** شبا: IR و ۲۴ رقم، با بررسی پیمانه‌ی ۹۷. */
function normalizeIban(value: string): string {
  return toEnDigits(value).toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^(?!IR)/, "IR")
}
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^IR\d{24}$/.test(iban)) return false
  // انتقال چهار نویسه‌ی اول به انتها و تبدیل حروف به عدد (I=18، R=27)
  const numeric = `${iban.slice(4)}1827${iban.slice(2, 4)}`
  let rem = 0
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97
  return rem === 1
}

/** طرح‌های آماده برای فرم‌ها؛ مقدار خروجی یکسان‌سازی‌شده است. */
export const schemas = {
  nationalId: z
    .string()
    .transform(onlyDigits)
    .refine(isValidNationalId, "کد ملی معتبر نیست؛ ده رقم با رقم کنترل درست وارد کنید."),
  mobile: z
    .string()
    .transform(normalizeMobile)
    .refine(isValidMobile, "شماره‌ی موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود."),
  postalCode: z
    .string()
    .transform(onlyDigits)
    .refine(isValidPostalCode, "کد پستی باید ۱۰ رقم باشد."),
  cardNumber: z
    .string()
    .transform(onlyDigits)
    .refine(isValidCardNumber, "شماره‌ی کارت معتبر نیست؛ ۱۶ رقم کارت را بررسی کنید."),
  iban: z
    .string()
    .transform(normalizeIban)
    .refine(isValidIban, "شماره‌ی شبا معتبر نیست؛ IR و ۲۴ رقم را بررسی کنید."),
  legalNationalId: z
    .string()
    .transform(onlyDigits)
    .refine(isValidLegalNationalId, "شناسه‌ی ملی معتبر نیست؛ ۱۱ رقم را بررسی کنید."),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine(isValidPhone, "تلفن را با پیش‌شماره‌ی شهر وارد کنید (۱۱ رقم، مثل ۰۲۱۸۸۰۰۰۰۰۰)."),
  email: z.email("نشانی ایمیل معتبر نیست."),
  /** تاریخ شمسی «1405/08/14»؛ رشته‌ی خالی یعنی واردنشده (الزامی بودن را با required جدا بسنجید). */
  jalaliDate: z.string().refine((v) => v === "" || parseJalali(v) !== undefined, "تاریخ معتبر نیست؛ به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید."),
  /** متن الزامی با پیام «تکمیل «برچسب» الزامی است.» */
  required: (label: string) => z.string().trim().min(1, `تکمیل «${label}» الزامی است.`),
}
