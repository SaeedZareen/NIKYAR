import { useQuery } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

/** مقدارهای فعال یک فهرست پایه (برای فیلدهای انتخابی فرم‌ها). */
export function useLookupItems(code: string) {
  return useQuery({
    queryKey: ["lookup-items", code],
    queryFn: () => unwrap(api.GET("/api/lookups/items/", { params: { query: { list: code, is_active: "true" } } })),
    staleTime: 5 * 60_000,
  })
}
