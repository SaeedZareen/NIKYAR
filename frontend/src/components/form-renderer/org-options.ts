import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import type { PickerOption } from "@/components/search-picker"
import { api, unwrap } from "@/lib/api/client"

/** واحدها به ترتیب درخت، با تورفتگی و نام واحد بالادست. */
export function useUnitOptions(): PickerOption[] {
  const units = useQuery({ queryKey: ["org", "unit-lookup"], queryFn: () => unwrap(api.GET("/api/org/unit-lookup/")), staleTime: 5 * 60_000 }).data
  return React.useMemo(() => {
    const list = units ?? []
    const byParent = new Map<number | null, typeof list>()
    for (const u of list) byParent.set(u.parent ?? null, [...(byParent.get(u.parent ?? null) ?? []), u])
    const known = new Set(list.map((u) => u.id))
    const out: PickerOption[] = []
    const walk = (parent: number | null, depth: number, parentName?: string) => {
      for (const u of byParent.get(parent) ?? []) {
        out.push({ value: String(u.id), label: u.name, hint: parentName, depth })
        walk(u.id, depth + 1, u.name)
      }
    }
    walk(null, 0)
    // واحدی که بالادستش غیرفعال است، در ریشه نمایش داده می‌شود.
    for (const u of list) if (u.parent !== null && !known.has(u.parent) && !out.some((o) => o.value === String(u.id))) walk(u.parent, 0)
    return out
  }, [units])
}

/** نام کاربران ذخیره‌شده (برای نمایش مقدار پیش‌نویس یا پیش‌فرض «خودم»). */
export function useUserNames(ids: number[]) {
  const key = ids.join(",")
  return useQuery({
    queryKey: ["users", "names", key],
    queryFn: () => unwrap(api.GET("/api/auth/user-lookup/", { params: { query: { ids: key } } })),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  })
}

/** نام همه‌ی سمت‌ها (برای نمایش مقدار ذخیره‌شده). */
export function usePositionNames() {
  return useQuery({ queryKey: ["org", "position-lookup", undefined], queryFn: () => unwrap(api.GET("/api/org/position-lookup/")), staleTime: 5 * 60_000 }).data
}
