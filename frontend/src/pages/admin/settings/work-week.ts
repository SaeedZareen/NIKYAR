import { z } from "zod"
import { WEEKDAYS } from "@/app/work-calendar"

type WeekDay = { day: number; start: string; end: string }

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const daySchema = z.object({ working: z.boolean(), start: z.string(), end: z.string() }).superRefine((d, ctx) => {
  if (!d.working) return
  if (!TIME.test(d.start))
    ctx.addIssue({
      code: "custom",
      path: ["start"],
      message: "ساعت شروع را به شکل ۰۸:۰۰ وارد کنید.",
    })
  else if (!TIME.test(d.end))
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "ساعت پایان را به شکل ۱۶:۰۰ وارد کنید.",
    })
  else if (d.start >= d.end)
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "ساعت پایان باید بعد از ساعت شروع باشد.",
    })
})
export const weekSchema = z.object({
  days: z.array(daySchema).refine((days) => days.some((d) => d.working), "دست‌کم یک روز کاری انتخاب کنید."),
})
export type WeekValues = z.input<typeof weekSchema>

/** برنامه‌ی ذخیره‌شده (فقط روزهای کاری) به ردیف هر هفت روز. */
export function weekToForm(days: WeekDay[]): WeekValues {
  return {
    days: WEEKDAYS.map((_, day) => {
      const d = days.find((x) => x.day === day)
      return {
        working: !!d,
        start: d?.start ?? "08:00",
        end: d?.end ?? "16:00",
      }
    }),
  }
}

/** ردیف‌های فرم به برنامه‌ی ذخیره‌شده: فقط روزهای کاری. */
export function formToWeek(values: WeekValues): WeekDay[] {
  return values.days.flatMap((d, day) => (d.working ? [{ day, start: d.start, end: d.end }] : []))
}

/** برچسب خانه‌های جدول برای خلاصه‌ی خطا. */
export const WEEK_LABELS = {
  ...Object.fromEntries(
    WEEKDAYS.flatMap((w, i) => [
      [`days.${i}.start`, `شروع ${w}`],
      [`days.${i}.end`, `پایان ${w}`],
    ])
  ),
  days: "روزهای کاری",
}

