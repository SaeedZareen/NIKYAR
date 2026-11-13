import { z } from "zod"
import { toFaDigits } from "@/lib/format"

/** قاعده‌ی zod برای عدد صحیح بازه‌دار در فرم تنظیمات (مقدار رشته‌ی رقمی). */
export function countRule(label: string, low: number, high: number, unit: string) {
  return z
    .string()
    .refine((v) => v !== "", `تکمیل «${label}» الزامی است.`)
    .refine((v) => Number(v) >= low && Number(v) <= high, `بین ${toFaDigits(low)} تا ${toFaDigits(high)} ${unit}.`)
}
