// وضعیت «راه‌اندازی نخستین»: تا وقتی هیچ کاربری نیست، صفحه‌ی ورود به جادوگر راه‌اندازی می‌رود.
import { useQuery } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

export const SETUP_KEY = ["setup"] as const

export function useSetupStatus() {
  return useQuery({ queryKey: SETUP_KEY, queryFn: () => unwrap(api.GET("/api/setup/")), staleTime: Infinity, retry: false })
}
