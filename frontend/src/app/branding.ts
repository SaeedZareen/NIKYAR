// نام و لوگوی سازمان از «تنظیمات › مشخصات سازمان»؛ بدون نیاز به ورود (برای صفحه‌ی ورود و نوار بالا).
import { useQuery } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

export const BRANDING_KEY = ["branding"] as const

export function useBranding() {
  const { data } = useQuery({ queryKey: BRANDING_KEY, queryFn: () => unwrap(api.GET("/api/org/branding/")), staleTime: Infinity })
  return { name: data?.name ?? "", shortName: data?.short_name || data?.name || "", logoUrl: data?.logo_url ?? "" }
}
