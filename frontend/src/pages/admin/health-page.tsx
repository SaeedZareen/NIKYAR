import * as React from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw, Settings } from "lucide-react"
import { useAuth } from "@/app/auth"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"

type Health = Schemas["Health"]
type Attempt = Schemas["UpdateAttempt"]
/** یک خطا با شماره‌ی ردیف: خطای تکراری در یک دقیقه زمان و متن یکسان دارد. */
type RecentError = Schemas["RecentError"] & { id: string }
const RESULT_TONE = { ok: "success", rolled_back: "warning", failed: "destructive" } as const

/** «سلامت سامانه»: فضای دیسک، پشتیبان، خطاها، لایسنس و به‌روزرسانی؛ هشدار هر مشکل را کار دوره‌ای به راهبران می‌فرستد. */
export default function HealthPage() {
  const { can } = useAuth()
  const health = useQuery({ queryKey: ["monitoring"], queryFn: () => unwrap(api.GET("/api/monitoring/")) })
  const h = health.data
  const problems = h?.checks.filter((c) => !c.ok).length ?? 0

  return (
    <>
      <PageHeader
        title="سلامت سامانه"
        description="سامانه هر ساعت این موارد را بررسی می‌کند و برای هر مشکل تازه به دارندگان مجوز «سلامت سامانه» اعلان (و طبق «متن اعلان‌ها» ایمیل و پیامک) می‌فرستد؛ مشکل پابرجا در فاصله‌ی «تکرار هشدار» دوباره یادآوری می‌شود."
        meta={h && `نسخه‌ی ${toFaDigits(h.version)} · پایگاه داده: ${h.database}`}
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => health.refetch()} disabled={health.isFetching}>
              {health.isFetching ? <Spinner /> : <RefreshCw />} بررسی دوباره
            </Button>
            {can("settings.manage") && (
              <Button variant="ghost" asChild>
                <Link to="/admin/settings?section=monitoring">
                  <Settings /> مرزهای هشدار
                </Link>
              </Button>
            )}
          </>
        }
      />
      {health.error && (
        <Alert variant="destructive">
          <AlertTitle>{errorMessage(health.error)}</AlertTitle>
        </Alert>
      )}
      {h ? (
        <>
          <Section
            title="وضعیت"
            meta={<StatusBadge tone={problems ? "warning" : "success"}>{problems ? `${toFaDigits(problems)} مورد نیاز به توجه` : "همه‌چیز سالم است"}</StatusBadge>}
          >
            <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {h.checks.map((c) => (
                <li key={c.code} className="flex flex-col gap-1.5 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-medium">{c.title}</span>
                    <StatusBadge tone={c.ok ? "success" : "warning"}>{c.ok ? "سالم" : "نیاز به توجه"}</StatusBadge>
                  </div>
                  <p className="text-xs">{c.value}</p>
                  {!c.ok && (
                    <p className="text-xs text-warning">
                      {c.problem}
                      {c.url && (
                        <>
                          {" "}
                          <Link to={c.url} className="font-medium underline underline-offset-2">
                            بررسی
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
          <Updates rows={h.updates} />
          <Errors rows={h.errors} />
        </>
      ) : (
        !health.error && (
          <div role="status" aria-label="در حال بارگذاری" className="flex flex-col gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-24" />
          </div>
        )
      )}
    </>
  )
}

const updateCol = columnHelper<Attempt>()

function Updates({ rows }: { rows: Health["updates"] }) {
  const columns = React.useMemo<DataTableColumn<Attempt>[]>(
    () => [
      updateCol.accessor("finished_at", { header: "زمان", meta: { label: "زمان", primary: true }, cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span> }),
      updateCol.accessor((u) => `${u.from_version} ← ${u.to_version}`, {
        id: "versions",
        header: "نسخه",
        meta: { label: "نسخه" },
        cell: (c) => <span className="tabular-nums">{toFaDigits(`${c.row.original.from_version} به ${c.row.original.to_version}`)}</span>,
      }),
      updateCol.accessor("result_label", {
        header: "نتیجه",
        meta: { label: "نتیجه" },
        cell: (c) => <StatusBadge tone={RESULT_TONE[c.row.original.result]}>{c.getValue()}</StatusBadge>,
      }),
      updateCol.accessor("log", {
        header: "فایل گزارش",
        enableSorting: false,
        meta: { label: "فایل گزارش" },
        cell: (c) => (
          <bdi dir="ltr" className="text-2xs text-muted-foreground">
            {c.getValue()}
          </bdi>
        ),
      }),
    ],
    []
  )
  const view = useTableView("health-updates")
  const table = useDataTable({ view, columns, data: rows, getRowId: (u) => u.finished_at })
  return (
    <Section
      title="به‌روزرسانی‌ها"
      description="هر به‌روزرسانی با update.bat پیش از هر کار از همه‌ی اطلاعات پشتیبان می‌گیرد و پس از نصب، سامانه را می‌آزماید؛ اگر جایی شکست بخورد، نسخه‌ی قبلی و اطلاعات پیش از به‌روزرسانی خودکار برمی‌گردند. گزارش کامل هر بار در پوشه‌ی backend\data\logs است."
    >
      <DataTable table={table} view={view} caption="به‌روزرسانی‌ها" compact empty={{ title: "از زمان نصب، به‌روزرسانی امن انجام نشده است" }} />
    </Section>
  )
}

const errorCol = columnHelper<RecentError>()

function Errors({ rows }: { rows: Health["errors"] }) {
  const columns = React.useMemo<DataTableColumn<RecentError>[]>(
    () => [
      errorCol.accessor("at", { header: "زمان", enableSorting: false, size: 130, meta: { label: "زمان", primary: true }, cell: (c) => <span className="tabular-nums">{c.getValue()}</span> }),
      errorCol.accessor("message", {
        header: "خطا",
        enableSorting: false,
        size: 560,
        meta: { label: "خطا", wrap: true },
        cell: (c) => (
          <bdi dir="ltr" className="font-mono text-2xs break-all">
            {c.getValue()}
          </bdi>
        ),
      }),
    ],
    []
  )
  const view = useTableView("health-errors")
  const data = React.useMemo(() => rows.map((e, i) => ({ ...e, id: String(i) })), [rows])
  const table = useDataTable({ view, columns, data, getRowId: (e) => e.id })
  return (
    <Section
      title="خطاهای ۲۴ ساعت گذشته"
      description="متن فنی خطاها برای پشتیبانی است. فهرست کامل در فایل backend\data\logs\errors.log است؛ در صورت تکرار، آن را برای پشتیبانی بفرستید."
    >
      <DataTable table={table} view={view} caption="خطاهای ۲۴ ساعت گذشته" compact empty={{ title: "در ۲۴ ساعت گذشته خطایی رخ نداده است" }} />
    </Section>
  )
}
