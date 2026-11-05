// قالب‌بندی نمایشی: ارقام فارسی، جداکننده‌ی هزارگان، تاریخ شمسی.
// مقدارها در کد و API لاتین می‌مانند؛ این توابع فقط برای نمایش‌اند.
import { format as formatJalali, isValid, parse } from "date-fns-jalali"

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"

/** ارقام لاتین را فارسی می‌کند (برای متن نمایشی). */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

/** ارقام فارسی و عربی را لاتین می‌کند (پیش از اعتبارسنجی و ارسال). */
export function toEnDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

/** فقط رقم‌ها (پس از یکسان‌سازی)؛ برای فیلدهایی مثل کد ملی و موبایل. */
export function onlyDigits(value: string): string {
  return toEnDigits(value).replace(/\D/g, "")
}

const numberFormat = new Intl.NumberFormat("fa-IR")

/** عدد با ارقام فارسی و جداکننده‌ی «٬». */
export function formatNumber(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "—" : numberFormat.format(value)
}

/** مبلغ به تومان: «۱۲٬۴۵۰٬۰۰۰ تومان». */
export function formatMoney(value: number | null | undefined): string {
  return value == null ? "—" : `${formatNumber(value)} تومان`
}


/** قالب تاریخ در API: «۱۴۰۵/۰۸/۱۴» با ارقام لاتین. */
const API_DATE_FORMAT = "yyyy/MM/dd"

/** رشته‌ی تاریخ شمسی API را به Date تبدیل می‌کند؛ نامعتبر ← undefined. */
export function parseJalali(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const d = parse(toEnDigits(value), API_DATE_FORMAT, new Date())
  return isValid(d) ? d : undefined
}

/** Date را به رشته‌ی شمسی API تبدیل می‌کند. */
export function toJalaliString(date: Date | null | undefined): string {
  return date ? formatJalali(date, API_DATE_FORMAT) : ""
}

/**
 * نمایش تاریخ شمسی با ارقام فارسی.
 * ورودی: Date، رشته‌ی ISO، یا رشته‌ی شمسی API.
 * سبک‌ها: short «۱۴۰۵/۰۸/۱۴»، long «۱۴ آبان ۱۴۰۵»، full «چهارشنبه ۱۴ آبان ۱۴۰۵»، weekday «چهارشنبه».
 */
export function formatDate(
  value: Date | string | null | undefined,
  style: "short" | "long" | "full" | "weekday" = "short"
): string {
  const date = typeof value === "string" ? (parseJalali(value) ?? new Date(value)) : value
  if (!date || !isValid(date)) return "—"
  const pattern = { short: API_DATE_FORMAT, long: "d MMMM yyyy", full: "EEEE d MMMM yyyy", weekday: "EEEE" }[style]
  return toFaDigits(formatJalali(date, pattern))
}

/** زمان «۱۴:۰۵». */
function formatTime(value: Date | string | null | undefined): string {
  const date = typeof value === "string" ? new Date(value) : value
  if (!date || !isValid(date)) return "—"
  return toFaDigits(formatJalali(date, "HH:mm"))
}

/** تاریخ و زمان «۱۴۰۵/۰۸/۱۴ ۱۴:۰۵». */
export function formatDateTime(value: Date | string | null | undefined): string {
  const date = typeof value === "string" ? new Date(value) : value
  if (!date || !isValid(date)) return "—"
  return `${formatDate(date)} ${formatTime(date)}`
}
