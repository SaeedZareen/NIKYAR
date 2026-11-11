// وضعیت نمای جدول در دو جا نگه داشته می‌شود:
// - نشانی صفحه (جست‌وجو، مرتب‌سازی، فیلترها، صفحه): قابل اشتراک، و «بازگشت» مرورگر کار می‌کند.
// - حافظه‌ی مرورگر (ستون‌های نمایان، عرض، سنجاق، تراکم): ترجیح شخصی هر کاربر.
import * as React from "react"
import { useSearchParams } from "react-router"
import type {
  ColumnFiltersState,
  ColumnPinningState,
  ColumnSizingState,
  PaginationState,
  SortingState,
  Updater,
  ColumnVisibilityState,
} from "@tanstack/react-table"

export type Density = "compact" | "comfortable"

type Prefs = {
  columnVisibility: ColumnVisibilityState
  columnSizing: ColumnSizingState
  columnPinning: ColumnPinningState
  density: Density
}

export const PAGE_SIZES = [10, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25
const EMPTY_PREFS: Prefs = { columnVisibility: {}, columnSizing: {}, columnPinning: { start: [], end: [] }, density: "compact" }

function readPrefs(key: string, defaults: Prefs): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(key) ?? "{}") }
  } catch {
    return defaults
  }
}

function resolve<T>(updater: Updater<T>, old: T): T {
  return typeof updater === "function" ? (updater as (o: T) => T)(old) : updater
}

/** «name,-date» ⇄ وضعیت مرتب‌سازی */
const parseSort = (s: string): SortingState =>
  s ? s.split(",").map((x) => ({ id: x.replace(/^-/, ""), desc: x.startsWith("-") })) : []
const serializeSort = (s: SortingState) => s.map((x) => (x.desc ? "-" : "") + x.id).join(",")

/** پارامترهای استاندارد درخواست به سرور، ساخته‌شده از وضعیت نما. */
type TableQuery = { page: number; page_size: number; search?: string; ordering?: string } & Record<string, string | number | undefined>

export type TableView = ReturnType<typeof useTableView>

type Options = {
  /** پیشوند پارامترهای نشانی، وقتی چند جدول در یک صفحه‌اند. */
  urlKey?: string
  /** مرتب‌سازی پیش‌فرض، مثل «-hire_date». */
  defaultSort?: string
  /** ستون‌هایی که تا کاربر خودش نمایانشان نکند پنهان‌اند (جدول‌های پرستون، مثل ثبت‌های فرم). */
  defaultHidden?: string[]
}

/** فیلتر ستون‌ها همیشه فهرستی از مقدارهاست (چندانتخابی)؛ در نشانی: f.status=active,leave */
export function useTableView(id: string, { urlKey = "", defaultSort = "", defaultHidden }: Options = {}) {
  const [params, setParams] = useSearchParams()
  const storageKey = `nikyar:table:${id}`
  const hiddenKey = defaultHidden?.join() ?? ""
  const defaults = React.useMemo<Prefs>(
    () => (hiddenKey ? { ...EMPTY_PREFS, columnVisibility: Object.fromEntries(hiddenKey.split(",").map((c) => [c, false])) } : EMPTY_PREFS),
    [hiddenKey]
  )
  const [prefs, setPrefs] = React.useState<Prefs>(() => readPrefs(storageKey, defaults))

  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs))
    } catch {
      // حافظه‌ی مرورگر در دسترس نیست؛ ترجیحات فقط تا بستن صفحه می‌ماند.
    }
  }, [prefs, storageKey])

  const search = params.toString()
  const url = React.useMemo(() => {
    const sp = new URLSearchParams(search)
    const filterPrefix = `${urlKey}f.`
    const columnFilters: ColumnFiltersState = []
    sp.forEach((value, key) => {
      if (key.startsWith(filterPrefix)) columnFilters.push({ id: key.slice(filterPrefix.length), value: value.split(",") })
    })
    const size = Number(sp.get(`${urlKey}size`))
    return {
      globalFilter: sp.get(`${urlKey}q`) ?? "",
      sorting: parseSort(sp.get(`${urlKey}sort`) ?? defaultSort),
      columnFilters,
      pagination: {
        pageIndex: Math.max(0, Number(sp.get(`${urlKey}page`) || 1) - 1),
        pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
      } satisfies PaginationState,
    }
  }, [search, urlKey, defaultSort])

  const patchUrl = React.useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "") next.delete(`${urlKey}${k}`)
            else next.set(`${urlKey}${k}`, v)
          }
          if (resetPage) next.delete(`${urlKey}page`)
          return next
        },
        { replace: true }
      )
    },
    [setParams, urlKey]
  )

  const handlers = React.useMemo(
    () => ({
      onGlobalFilterChange: (u: Updater<string>) => patchUrl({ q: resolve(u, url.globalFilter) || null }),
      onSortingChange: (u: Updater<SortingState>) => {
        const next = serializeSort(resolve(u, url.sorting))
        patchUrl({ sort: next === defaultSort ? null : next || null })
      },
      onColumnFiltersChange: (u: Updater<ColumnFiltersState>) => {
        const patch: Record<string, string | null> = {}
        for (const f of url.columnFilters) patch[`f.${f.id}`] = null
        for (const f of resolve(u, url.columnFilters)) {
          const values = f.value as string[]
          if (values.length) patch[`f.${f.id}`] = values.join(",")
        }
        patchUrl(patch)
      },
      onPaginationChange: (u: Updater<PaginationState>) => {
        const next = resolve(u, url.pagination)
        patchUrl(
          {
            page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null,
            size: next.pageSize !== DEFAULT_PAGE_SIZE ? String(next.pageSize) : null,
          },
          false
        )
      },
      onColumnVisibilityChange: (u: Updater<ColumnVisibilityState>) =>
        setPrefs((o) => ({ ...o, columnVisibility: resolve(u, o.columnVisibility) })),
      onColumnSizingChange: (u: Updater<ColumnSizingState>) =>
        setPrefs((o) => ({ ...o, columnSizing: resolve(u, o.columnSizing) })),
      onColumnPinningChange: (u: Updater<ColumnPinningState>) =>
        setPrefs((o) => ({ ...o, columnPinning: resolve(u, o.columnPinning) })),
    }),
    [url, patchUrl, defaultSort]
  )

  /** پارامترهای آماده برای درخواست سرور (جدول سمت سرور). */
  const query = React.useMemo<TableQuery>(() => {
    const q: TableQuery = { page: url.pagination.pageIndex + 1, page_size: url.pagination.pageSize }
    if (url.globalFilter) q.search = url.globalFilter
    if (url.sorting.length) q.ordering = serializeSort(url.sorting)
    for (const f of url.columnFilters) q[f.id] = (f.value as string[]).join(",")
    return q
  }, [url])

  const resetFilters = React.useCallback(() => {
    const patch: Record<string, string | null> = { q: null }
    for (const f of url.columnFilters) patch[`f.${f.id}`] = null
    patchUrl(patch)
  }, [url.columnFilters, patchUrl])

  return {
    id,
    state: {
      ...url,
      columnVisibility: prefs.columnVisibility,
      columnSizing: prefs.columnSizing,
      columnPinning: prefs.columnPinning,
    },
    handlers,
    query,
    density: prefs.density,
    setDensity: (density: Density) => setPrefs((o) => ({ ...o, density })),
    /** ستون‌ها، عرض‌ها، سنجاق‌ها و تراکم به حالت پیش‌فرض برمی‌گردند. */
    resetPrefs: () => setPrefs(defaults),
    /** جست‌وجو و همه‌ی فیلترها پاک می‌شوند. */
    resetFilters,
    isFiltered: url.globalFilter !== "" || url.columnFilters.length > 0,
  }
}
