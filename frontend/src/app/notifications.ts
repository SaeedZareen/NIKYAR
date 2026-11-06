// اعلان‌های کاربر: شمار خوانده‌نشده‌ها (به‌روزرسانی دوره‌ای) و خوانده کردن.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Notification = Schemas["Notification"]
export const NOTIFICATIONS_KEY = ["notifications"] as const

/** هر ۳۰ ثانیه و با برگشتن به زبانه‌ی مرورگر تازه می‌شود. */
export function useUnreadCount() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread-count"],
    queryFn: () => unwrap(api.GET("/api/notifications/unread-count/")),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    select: (d) => d.unread,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.POST("/api/notifications/{id}/read/", { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/notifications/read-all/")),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  })
}
