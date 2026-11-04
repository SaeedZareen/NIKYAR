// اجزای مشترک صفحه‌ها، ساخته‌شده روی کامپوننت‌های وایب‌فارسی و قواعد design-system/nikyar/MASTER.md
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronLeft, RotateCw } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, type DialogProps } from "@/components/ui/dialog";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/toast";
import { toGregorian, toJalali } from "@/lib/jalali";
import { cn, en } from "@/lib/utils";
import { ApiError } from "./api";

const APP = "نیک‌یار";

export type Crumb = { label: string; to?: string };

/** عنوان سند مرورگر؛ برای زبانه‌ها، تاریخچه و صفحه‌خوان‌ها */
export function useDocumentTitle(title?: string) {
  React.useEffect(() => {
    if (title) document.title = `${title} | ${APP}`;
  }, [title]);
}

/** سرصفحه: یک h1، مسیر برای صفحه‌های عمیق، و حداکثر یک اقدام اصلی */
export function PageHeader({ title, docTitle, description, crumbs, actions }: {
  title: React.ReactNode; docTitle?: string; description?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode;
}) {
  useDocumentTitle(docTitle ?? (typeof title === "string" ? title : undefined));
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="مسیر صفحه" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {c.to ? <Link to={c.to} className="rounded-control underline-offset-4 hover:text-foreground hover:underline">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                  {i < crumbs.length - 1 && <ChevronLeft className="size-4" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-bold leading-tight text-balance">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** سطح محتوا. «flush» برای فهرست‌ها: بدون فاصله‌ی داخلی تا جدول لبه‌به‌لبه بنشیند (بدون کارت داخل کارت). */
export function Panel({ title, description, actions, children, className, bodyClassName, flush, as: Tag = "section" }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  className?: string; bodyClassName?: string; flush?: boolean; as?: "section" | "div";
}) {
  const id = React.useId();
  return (
    <Tag aria-labelledby={title ? id : undefined} className={cn("rounded-surface border-line border-border bg-card shadow-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 id={id} className="text-lg font-semibold leading-tight">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-5", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** اسکلت هم‌شکل محتوا به‌جای چرخنده */
export function LoadingBlock({ rows = 4, label = "در حال بارگذاری" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  );
}

/** خطای بارگذاری با راه بازیابی (error-recovery) */
export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "اطلاعات بارگذاری نشد.";
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-surface border-line border-destructive/40 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-5 shrink-0" aria-hidden /> {msg}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RotateCw className="size-4" aria-hidden /> تلاش دوباره</Button>}
    </div>
  );
}

const LINK_VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border-line border-input bg-transparent hover:bg-accent",
  ghost: "hover:bg-accent",
} as const;
/** لینکی که شبیه دکمه است؛ برای ناوبری (نه اقدام) — قابل باز کردن در زبانه‌ی جدید */
export function LinkButton({ to, variant = "default", className, children, ...props }: {
  to: string; variant?: keyof typeof LINK_VARIANTS; className?: string; children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link to={to} {...props} className={cn(
      "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 text-sm font-medium transition-colors duration-(--motion) ease-motion active:[transform:var(--press)]",
      LINK_VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

/** خطای سطح صفحه: عنوان صفحه + پیام + راه بازیابی */
export function PageError({ error, onRetry, back }: { error: unknown; onRetry?: () => void; back?: { to: string; label: string } }) {
  return (
    <>
      <PageHeader title="این صفحه نمایش داده نشد" crumbs={back ? [{ label: back.label, to: back.to }] : undefined} />
      <ErrorBlock error={error} onRetry={onRetry} />
    </>
  );
}

/** دکمه‌ی ارسال با حالت انتظار (loading-buttons) */
export function SubmitButton({ loading, children, loadingText, ...props }: ButtonProps & { loading?: boolean; loadingText?: string }) {
  return (
    <Button {...props} disabled={loading || props.disabled} aria-busy={loading || undefined}>
      {loading && <span aria-hidden className="inline-block size-4 animate-spin rounded-full border-2 border-current border-e-transparent" />}
      {loading ? (loadingText ?? "در حال ثبت…") : children}
    </Button>
  );
}

/**
 * خلاصه‌ی خطاها پس از ارسال ناموفق (error-summary + focus-management):
 * فوکوس روی خلاصه می‌رود و هر مورد به فیلد مربوط لینک دارد.
 */
export function ErrorSummary({ errors, labels = {}, title = "لطفاً موارد زیر را اصلاح کنید" }: {
  errors: Record<string, string>; labels?: Record<string, string>; title?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors).filter(([k]) => k !== "_schema");
  const sig = entries.map(([k, v]) => k + v).join("|");
  React.useEffect(() => {
    if (sig) ref.current?.focus();
  }, [sig]);
  if (!entries.length) return null;
  const go = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const base = key.split(".")[0];
    const el = document.getElementById(`f-${base}`) ?? document.querySelector<HTMLElement>(`[name="${base}"]`);
    el?.scrollIntoView({ block: "center" });
    el?.focus();
  };
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title"
      className="mb-6 rounded-surface border-line border-destructive/50 bg-destructive/5 p-4 focus-visible:outline-none">
      <h2 id="error-summary-title" className="flex items-center gap-2 text-base font-semibold text-destructive">
        <AlertCircle className="size-5" aria-hidden /> {title}
      </h2>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
        {entries.map(([k, msg]) => (
          <li key={k}>
            <a href={`#f-${k.split(".")[0]}`} onClick={go(k)} className="text-destructive underline underline-offset-4">
              {labels[k.split(".")[0]] ? `${labels[k.split(".")[0]]}: ` : ""}{msg}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** پنجره‌ای که اگر تغییر ذخیره‌نشده داشته باشد، پیش از بستن تأیید می‌گیرد (sheet-dismiss-confirm) */
export function GuardedDialog({ dirty, onOpenChange, ...props }: DialogProps & { dirty?: boolean }) {
  const [ask, setAsk] = React.useState(false);
  return (
    <>
      <Dialog {...props} onOpenChange={(o) => (!o && dirty ? setAsk(true) : onOpenChange(o))} />
      <AlertDialog open={ask} onOpenChange={setAsk} destructive title="تغییرات ذخیره نشده‌اند"
        description="اگر پنجره را ببندید، اطلاعات واردشده از بین می‌رود." confirmText="بستن بدون ذخیره" cancelText="ادامه‌ی ویرایش"
        onConfirm={() => { setAsk(false); onOpenChange(false); }} />
    </>
  );
}

/** حالت فیلتر در نشانی صفحه تا «بازگشت» و اشتراک لینک آن را حفظ کند (state-preservation, deep-linking) */
export function useUrlState(key: string, initial = ""): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? initial;
  const set = React.useCallback((v: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === initial || v === "") next.delete(key); else next.set(key, v);
      if (key !== "page") next.delete("page");
      return next;
    }, { replace: true });
  }, [key, initial, setParams]);
  return [value, set];
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
export function JalaliDateInput({ value, onChange, className, id }: {
  value?: string | null; onChange: (v: string) => void; className?: string; id?: string;
}) {
  return (
    <div id={id} tabIndex={-1} className="rounded-field">
      <DatePicker value={parseJalali(value)} onChange={(d) => onChange(formatJalaliString(d))} className={className} />
    </div>
  );
}

type Tone = "success" | "warning" | "destructive" | "brand" | "neutral";
const TONE: Record<string, Tone> = {
  running: "brand", open: "warning", completed: "success", done: "success", cancelled: "neutral",
  active: "success", terminated: "destructive", suspended: "warning", on_leave: "warning", retired: "neutral",
};
const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", destructive: "bg-destructive/10 text-destructive",
  brand: "bg-brand/10 text-brand", neutral: "bg-muted text-muted-foreground",
};
/** برچسب وضعیت: همیشه متن دارد؛ رنگ تنها حامل معنا نیست */
export function StatusBadge({ status, label, tone }: { status?: string; label: React.ReactNode; tone?: Tone }) {
  const t = tone ?? TONE[status ?? ""] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-6", TONE_CLASS[t])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
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
      const fields = err.fields ?? {};
      // اگر خطای فیلد داریم، «خلاصه‌ی خطا» بالای فرم کافی است؛ toast تکراری نمی‌دهیم
      if (!Object.keys(fields).length) toast({ title: err.message || "انجام نشد؛ دوباره تلاش کنید.", variant: "error" });
      return { ok: false, fields };
    }
  }, [toast]);
}

/** فهرست تعریف برای اطلاعات فقط‌خواندنی (read-only-distinction) */
export function KeyValue({ items, columns = 2 }: { items: { label: string; value: React.ReactNode; ltr?: boolean }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", columns >= 2 && "sm:grid-cols-2", columns === 3 && "lg:grid-cols-3")}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 font-medium break-words" dir={it.ltr ? "ltr" : undefined} style={it.ltr ? { textAlign: "end" } : undefined}>
            {it.value === "" || it.value === null || it.value === undefined ? <span className="text-muted-foreground">ثبت نشده</span> : it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
