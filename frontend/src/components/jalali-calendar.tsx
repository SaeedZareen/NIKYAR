// تقویم شمسی سامانه: تقویم «آوان» (تعطیلات رسمی ایران، شنبه اول هفته، جمعه تعطیل، ارقام فارسی).
// رنگ‌ها و اندازه‌ها از توکن‌های index.css می‌آیند؛ پوسته‌ی تیره خودکار است.
import { AvanCalendar, type AvanCalendarProps } from "@avan-persian/react/client"
import "@avan-persian/react/client.css"

export type JalaliCalendarProps = Omit<AvanCalendarProps, "locale" | "dir">

export function JalaliCalendar(props: JalaliCalendarProps) {
  return <AvanCalendar locale="fa-IR" dir="rtl" {...props} />
}
