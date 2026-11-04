// اجزای مشترک صفحه‌ها، ساخته‌شده روی کامپوننت‌های وایب‌فارسی
import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { toGregorian, toJalali } from "@/lib/jalali";
import { cn, en, fa } from "@/lib/utils";
import { ApiError } from "./api";

export type Crumb = { label: string; to?: string };

export function PageHeader({ title, description, crumbs, actions }: {
  title: React.ReactNode; description?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="مسیر" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.to ? <Link to={c.to} className="hover:text-foreground">{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronLeft className="size-3" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-surface border-line border-border bg-card shadow-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold leading-tight">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "اطلاعات بارگذاری نشد.";
  return <Alert variant="destructive" title="خطا">{msg}</Alert>;
}

/** تاریخ شمسی به‌صورت رشته‌ی «۱۴۰۵/۰۸/۱۳» روی DatePicker وایب‌فارسی */
export function parseJalali(s?: string | null): Date | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(en(s ?? "").trim());
  return m ? toGregorian(+m[1], +m[2], +m[3]) : null;
}
export function formatJalaliString(d: Date | null): string {
  if (!d) return "";
  const j = toJalali(d);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}
export function JalaliDateInput({ value, onChange, disabled, className }: {
  value?: string | null; onChange: (v: string) => void; disabled?: boolean; className?: string;
}) {
  if (disabled) return <ReadValue value={value ? fa(value) : "—"} />;
  return <DatePicker value={parseJalali(value)} onChange={(d) => onChange(formatJalaliString(d))} className={className} />;
}

export function ReadValue({ value, ltr }: { value: React.ReactNode; ltr?: boolean }) {
  return (
    <div dir={ltr ? "ltr" : undefined} className={cn("min-h-10 rounded-field border-line border-border bg-muted/40 px-3 py-2 text-sm", ltr && "text-end")}>
      {value === "" || value === null || value === undefined ? "—" : value}
    </div>
  );
}

const STATUS: Record<string, "warning" | "success" | "secondary" | "destructive" | "brand"> = {
  running: "brand", open: "warning", completed: "success", done: "success", cancelled: "secondary",
  active: "success", terminated: "destructive", suspended: "warning", on_leave: "warning", retired: "secondary",
};
export function StatusBadge({ status, label }: { status: string; label: React.ReactNode }) {
  return <Badge variant={STATUS[status] ?? "secondary"}>{label}</Badge>;
}

/** نمایش خطای API در toast و برگرداندن خطاهای فیلدها */
export function useApiAction() {
  const { toast } = useToast();
  return React.useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<{ ok: boolean; data?: T; fields?: Record<string, string> }> => {
    try {
      const data = await fn();
      if (success) toast({ title: success, variant: "success" });
      return { ok: true, data };
    } catch (e) {
      const err = e as ApiError;
      toast({ title: err.message || "خطایی رخ داد.", variant: "error" });
      return { ok: false, fields: err.fields ?? {} };
    }
  }, [toast]);
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode; ltr?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium" dir={it.ltr ? "ltr" : undefined} style={it.ltr ? { textAlign: "end" } : undefined}>
            {it.value === "" || it.value === null || it.value === undefined ? "—" : it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
