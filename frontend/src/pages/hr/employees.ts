import { useQuery } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

/** کلید داده‌ی پرونده‌های پرسنلی (فهرست و هر پرونده). */
export const EMPLOYEES_KEY = ["hr", "employees"] as const

export const STATUS_TONES = { active: "success", separated: "neutral" } as const

/** فیلدهای دلخواه پرونده (آخرین نسخه‌ی منتشرشده): زبانه‌ی «اطلاعات تکمیلی» و ستون‌های جدول پرونده‌ها. */
export function useCustomFields() {
  return useQuery({ queryKey: [...EMPLOYEES_KEY, "custom-fields"], queryFn: () => unwrap(api.GET("/api/hr/employees/custom-fields/")), staleTime: 60_000 })
}
