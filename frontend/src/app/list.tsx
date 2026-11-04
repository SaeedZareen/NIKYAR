// فهرست واکنش‌گرا: جدول روی دسکتاپ، کارت روی موبایل (design-system/nikyar/MASTER.md §۵)
// - هر ردیف یک لینک واقعی است (صفحه‌کلید، باز کردن در زبانه‌ی جدید)؛ کل ردیف با «لینک کشیده» کلیک‌پذیر است.
// - مرتب‌سازی با aria-sort؛ صفحه‌بندی داخلی برای فهرست‌های سمت کاربر.
import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, fa } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** مقدار مرتب‌سازی سمت کاربر؛ اگر داده شود ستون قابل مرتب‌سازی است */
  sortValue?: (row: T) => string | number;
  /** کلید مرتب‌سازی سمت سرور (با sort/onSortChange) */
  sortKey?: string;
  /** ستون عنوان: لینک ردیف روی آن است و در کارت موبایل عنوان می‌شود */
  primary?: boolean;
  /** در کارت موبایل نمایش داده نشود */
  hideOnMobile?: boolean;
  numeric?: boolean;
  className?: string;
};

export type Sort = { key: string; dir: "asc" | "desc" } | null;

export interface ResponsiveListProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  rowHref?: (row: T) => string;
  /** اقدام‌های هر ردیف (دکمه‌ها)؛ بیرون از لینک ردیف قرار می‌گیرند */
  rowActions?: (row: T) => React.ReactNode;
  loading?: boolean;
  caption: string;
  empty?: { title: string; description?: string; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> };
  sort?: Sort;
  onSortChange?: (s: Sort) => void;
  pageSize?: number;
  rowClassName?: (row: T) => string | undefined;
}

export function ResponsiveList<T>({
  rows, columns, rowKey, rowHref, rowActions, loading, caption, empty, sort: sortProp, onSortChange, pageSize = 20, rowClassName,
}: ResponsiveListProps<T>) {
  const [localSort, setLocalSort] = React.useState<Sort>(null);
  const [page, setPage] = React.useState(1);
  const serverSort = !!onSortChange;
  const sort = serverSort ? sortProp ?? null : localSort;
  const setSort = serverSort ? onSortChange! : setLocalSort;
  React.useEffect(() => setPage(1), [rows.length]);

  const sorted = React.useMemo(() => {
    if (serverSort || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const out = [...rows].sort((a, b) => {
      const x = col.sortValue!(a), y = col.sortValue!(b);
      return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fa");
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sort, serverSort]);

  const paged = serverSort ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize);
  const pages = serverSort ? 1 : Math.ceil(sorted.length / pageSize);
  const primary = columns.find((c) => c.primary) ?? columns[0];

  if (loading) {
    return (
      <div role="status" aria-label="در حال بارگذاری فهرست" className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (!rows.length) {
    return <div className="p-4"><EmptyState icon={empty?.icon} title={empty?.title ?? "موردی وجود ندارد"} description={empty?.description} action={empty?.action} /></div>;
  }

  const toggle = (c: Column<T>) => {
    const key = c.sortKey ?? c.key;
    if (!sort || sort.key !== key) setSort({ key, dir: "asc" });
    else if (sort.dir === "asc") setSort({ key, dir: "desc" });
    else setSort(null);
  };
  const sortable = (c: Column<T>) => (serverSort ? !!c.sortKey : !!c.sortValue);
  const ariaSort = (c: Column<T>): React.AriaAttributes["aria-sort"] =>
    sort && sort.key === (c.sortKey ?? c.key) ? (sort.dir === "asc" ? "ascending" : "descending") : sortable(c) ? "none" : undefined;

  return (
    <div>
      {/* دسکتاپ */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 border-b border-border bg-secondary text-sm text-foreground/80">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={ariaSort(c)} className={cn("h-9 whitespace-nowrap border-s border-border px-3 text-start font-semibold first:border-s-0", c.className)}>
                  {sortable(c) ? (
                    <button type="button" onClick={() => toggle(c)} className="-mx-1 inline-flex items-center gap-1 rounded-control px-1 hover:text-foreground">
                      {c.header}
                      {ariaSort(c) === "ascending" ? <ArrowUp className="size-4" aria-hidden /> : ariaSort(c) === "descending" ? <ArrowDown className="size-4" aria-hidden /> : <ArrowUpDown className="size-4 opacity-50" aria-hidden />}
                    </button>
                  ) : c.header}
                </th>
              ))}
              {rowActions && <th scope="col" className="w-px border-s border-border px-3"><span className="sr-only">عملیات</span></th>}
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr key={rowKey(row)} className={cn("relative border-b border-border transition-colors last:border-0 even:bg-muted/70", href && "hover:bg-accent focus-within:bg-accent", rowClassName?.(row))}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn("border-s border-border px-3 py-1.5 align-middle first:border-s-0", c.numeric && "tabular-nums", c.className)}>
                      {c === primary && href ? (
                        <Link to={href} className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none">
                          {c.cell(row)}
                        </Link>
                      ) : c.cell(row)}
                    </td>
                  ))}
                  {rowActions && <td className="relative z-10 whitespace-nowrap border-s border-border px-1 py-0.5 text-end">{rowActions(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* موبایل */}
      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {paged.map((row) => {
          const href = rowHref?.(row);
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-medium">{primary.cell(row)}</div>
                {href && <ChevronLeft className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </div>
              <dl className="mt-1.5 grid grid-cols-1 gap-1 text-sm">
                {columns.filter((c) => c !== primary && !c.hideOnMobile).map((c) => (
                  <div key={c.key} className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">{c.header}:</dt>
                    <dd className="min-w-0">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
          return (
            <li key={rowKey(row)} className={rowClassName?.(row)}>
              {href ? <Link to={href} className="block px-3 py-2.5 active:bg-accent">{body}</Link> : <div className="px-3 py-2.5">{body}</div>}
              {rowActions && <div className="flex flex-wrap gap-2 px-4 pb-3">{rowActions(row)}</div>}
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/60 px-3 py-1.5 text-sm text-muted-foreground">
          <span>{fa(sorted.length)} مورد</span>
          <Pagination page={page} total={pages} onChange={setPage} size="sm" />
        </div>
      )}
    </div>
  );
}

/** نوار ابزار فهرست: جست‌وجو و فیلترها در یک ردیف، بالای جدول */
export function ListToolbar({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border px-3 py-2">
      {children}
      {count !== undefined && <span className="ms-auto text-sm text-muted-foreground" aria-live="polite">{fa(count)} مورد</span>}
    </div>
  );
}

/** فیلتر سمت کاربر با متن جست‌وجو */
export function matches(text: string, ...fields: (string | number | null | undefined)[]) {
  if (!text.trim()) return true;
  const t = text.trim();
  return fields.some((f) => f !== null && f !== undefined && String(f).includes(t));
}
