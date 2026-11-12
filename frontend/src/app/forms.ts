import { useQuery } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

/** کلید داده‌ی ثبت‌های فرم؛ با ثبت یا حذف پیش‌نویس، فهرست‌های ثبت تازه می‌شوند. */
export const SUBMISSIONS_KEY = ["forms", "submissions"] as const

/** کلید فهرست فرم‌های طراح. */
export const DESIGN_FORMS_KEY = ["forms", "design"] as const

/** نقش‌ها برای انتخاب (فقط نام؛ بدون مجوز مدیریت نقش‌ها). */
export function useRoleOptions() {
  const roles = useQuery({ queryKey: ["roles", "lookup"], queryFn: () => unwrap(api.GET("/api/auth/role-lookup/")), staleTime: 5 * 60_000 })
  return (roles.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))
}

/** کاتالوگ نوع فیلدها (برچسب، گروه و ویژگی‌ها) برای طراح. */
export function useFieldTypes() {
  return useQuery({ queryKey: ["forms", "field-types"], queryFn: () => unwrap(api.GET("/api/forms/field-types/")), staleTime: Infinity })
}
