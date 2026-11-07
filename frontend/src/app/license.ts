// وضعیت لایسنس: نوار هشدار پوسته و صفحه‌ی «ماژول‌ها و لایسنس».
import { useQuery } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

export const LICENSE_KEY = ["license"] as const

export function useLicense() {
  return useQuery({ queryKey: LICENSE_KEY, queryFn: () => unwrap(api.GET("/api/license/")), staleTime: 5 * 60_000 })
}
