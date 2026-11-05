// نشست کاربر: کاربر فعلی، مجوزها، ورود و خروج. نگهبان مسیرها کاربر واردنشده را به صفحه‌ی ورود می‌برد.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, Outlet, useLocation } from "react-router"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { Skeleton } from "@/components/ui/skeleton"

export type Me = Schemas["Me"]
export const SESSION_KEY = ["session"] as const

/** کاربر واردشده؛ null یعنی نشستی وجود ندارد (سرور ۲۰۴ برمی‌گرداند). */
async function fetchMe(): Promise<Me | null> {
  return (await unwrap(api.GET("/api/auth/session/"))) ?? null
}

export function useSession() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: fetchMe, staleTime: 5 * 60_000, retry: false })
}

/** کاربر واردشده (فقط داخل مسیرهای محافظت‌شده) و بررسی مجوز. */
export function useAuth() {
  const { data } = useSession()
  const user = data ?? null
  return {
    user,
    can: (permission: string) => !!user && (user.is_superuser || user.permissions.includes(permission)),
  }
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas["LoginRequest"]) => unwrap(api.POST("/api/auth/session/", { body })),
    onSuccess: (me) => qc.setQueryData(SESSION_KEY, me),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/auth/session/")),
    onSettled: () => {
      qc.clear()
      qc.setQueryData(SESSION_KEY, null)
    },
  })
}

/** نگهبان مسیرهای داخلی: تا روشن شدن نشست اسکلت صفحه، و بدون نشست هدایت به ورود. */
export function RequireAuth() {
  const { data, isPending } = useSession()
  const location = useLocation()
  if (isPending) {
    return (
      <div role="status" aria-label="در حال بارگذاری" className="flex h-svh flex-col">
        <Skeleton className="h-11 w-full rounded-none" />
        <div className="flex flex-1 gap-4 p-4">
          <Skeleton className="hidden h-full w-60 md:block" />
          <Skeleton className="h-64 flex-1" />
        </div>
      </div>
    )
  }
  if (!data) {
    const next = location.pathname + location.search
    return <Navigate to={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}
