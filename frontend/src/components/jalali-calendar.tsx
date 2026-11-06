// تقویم شمسی سامانه: تقویم «آوان» (شنبه اول هفته، ارقام فارسی) با تعطیلات و روزهای غیرکاری همین سازمان
// (از «تقویم کاری»). رنگ‌ها و اندازه‌ها از توکن‌های index.css می‌آیند؛ پوسته‌ی تیره خودکار است.
import * as React from "react"
import { AvanCalendar, type AvanCalendarProps } from "@avan-persian/react/client"
import "@avan-persian/react/client.css"
import { toJsWeekday, useWorkCalendar } from "@/app/work-calendar"
import { toJalaliString } from "@/lib/format"
import { cn } from "@/lib/utils"

export type JalaliCalendarProps = Omit<AvanCalendarProps, "locale" | "dir" | "holidays" | "weekendDays">

type Holidays = NonNullable<AvanCalendarProps["holidays"]>

export function JalaliCalendar(props: JalaliCalendarProps) {
  const { data } = useWorkCalendar()
  const holidays = React.useMemo<Holidays>(
    () =>
      (data?.holidays ?? []).map((h) => ({ date: h.date.replaceAll("/", "-"), title: h.title, type: "public" })),
    [data]
  )
  const weekendDays = React.useMemo(() => {
    const working = new Set((data?.work_week ?? []).map((d) => d.day))
    return data ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !working.has(d)).map(toJsWeekday) : [toJsWeekday(6)]
  }, [data])
  // شماره‌ی روزهای تعطیل قرمز (رسم تقویم‌های ایرانی)، افزون بر نقطه‌ی تعطیلی خود آوان.
  const holidayDates = React.useMemo(() => new Set((data?.holidays ?? []).map((h) => h.date)), [data])
  const { getDayMeta, ...rest } = props
  const dayMeta = React.useCallback(
    (date: Date) => {
      const meta = getDayMeta?.(date)
      return holidayDates.has(toJalaliString(date)) ? { ...meta, className: cn("text-destructive!", meta?.className) } : meta
    },
    [getDayMeta, holidayDates]
  )
  return <AvanCalendar locale="fa-IR" dir="rtl" holidays={holidays} weekendDays={weekendDays} getDayMeta={dayMeta} {...rest} />
}
