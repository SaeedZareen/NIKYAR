// تقویم کاری سازمان: روزهای کاری هفته و تعطیلات (رسمی و خاص سازمان)، برای همه‌ی تقویم‌های سامانه.
import { useQuery } from "@tanstack/react-query"
import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Holiday = Schemas["Holiday"]
export const CALENDAR_KEY = ["calendar"] as const

/** روزهای هفته‌ی شمسی: ۰ = شنبه … ۶ = جمعه (مانند سرور). */
export const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]

/** شماره‌ی روز شمسی ← Date#getDay (۰ = یکشنبه). */
export const toJsWeekday = (day: number) => (day + 6) % 7

export function useWorkCalendar() {
  return useQuery({ queryKey: CALENDAR_KEY, queryFn: () => unwrap(api.GET("/api/calendar/")), staleTime: 10 * 60_000 })
}
