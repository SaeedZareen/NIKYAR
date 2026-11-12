import { useQuery } from "@tanstack/react-query"
import type { StatusTone } from "@/components/status-badge"
import { api, unwrap } from "@/lib/api/client"

/** کلید داده‌ی درخواست‌های فرایند؛ با ثبت یا حذف پیش‌نویس، فهرست‌ها تازه می‌شوند. */
export const REQUESTS_KEY = ["workflow", "requests"] as const

/** کلید فهرست فرایندهای طراح. */
export const DESIGN_PROCESSES_KEY = ["workflow", "design"] as const

/** کلید داده‌ی کارتابل؛ با انجام، برداشتن یا رها کردن کار تازه می‌شود. */
export const TASKS_KEY = ["workflow", "tasks"] as const

/** شمار کارهای منتظر هر زبانه‌ی کارتابل (منو، پیشخوان و زبانه‌ها). */
export function useTaskCounts() {
  return useQuery({ queryKey: [...TASKS_KEY, "counts"], queryFn: () => unwrap(api.GET("/api/workflow/tasks/counts/")), refetchInterval: 30_000, refetchOnWindowFocus: true })
}

/** جمع کارهای منتظر (منتظر من، گروهی، جانشینی). */
export const pendingTotal = (c?: { mine: number; group: number; delegated: number }) => (c ? c.mine + c.group + c.delegated : 0)

/** رنگ وضعیت درخواست. */
export const REQUEST_TONES: Record<string, StatusTone> = { running: "info", completed: "success", rejected: "destructive", cancelled: "neutral", draft: "neutral" }
