import * as React from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Play } from "lucide-react"
import { toast } from "sonner"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"

type Job = Schemas["Job"]
type TaskInfo = Schemas["TaskInfo"]
const EMPTY: Job[] = []
const NO_TASKS: TaskInfo[] = []
const col = columnHelper<Job>()
const taskCol = columnHelper<TaskInfo>()
const TONE = { queued: "neutral", running: "info", done: "success", failed: "warning" } as const
const ACTIVE = new Set(["queued", "running"])

function JobStatus({ job }: { job: Job }) {
  return <StatusBadge tone={TONE[job.status]}>{job.status_label}</StatusBadge>
}

/** مدت اجرا: «۲ ثانیه»، «۳ دقیقه». */
function duration(job: Job) {
  if (!job.started_at || !job.finished_at) return "—"
  const s = Math.max(0, Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000))
  return s < 60 ? `${formatNumber(s)} ثانیه` : `${formatNumber(Math.round(s / 60))} دقیقه`
}

export default function JobsPage() {
  const qc = useQueryClient()
  const view = useTableView("jobs", { defaultSort: "-created_at" })
  const jobs = useQuery({
    queryKey: ["jobs", view.query],
    queryFn: () => unwrap(api.GET("/api/jobs/", { params: { query: view.query } })),
    placeholderData: keepPreviousData,
    // تا وقتی کاری در صف یا در حال اجراست، فهرست هر چند ثانیه تازه می‌شود.
    refetchInterval: (q) => (q.state.data?.results.some((j) => ACTIVE.has(j.status)) ? 3000 : false),
  })
  const tasks = useQuery({
    queryKey: ["jobs", "tasks"],
    queryFn: () => unwrap(api.GET("/api/jobs/tasks/")),
    refetchInterval: (q) => (q.state.data?.some((t) => t.last_job && ACTIVE.has(t.last_job.status)) ? 3000 : false),
  })
  const run = useMutation({
    mutationFn: (name: string) => unwrap(api.POST("/api/jobs/tasks/{task_name}/run/", { params: { path: { task_name: name } } })),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ["jobs"] })
      toast.success(`«${job.title}» در صف اجرا قرار گرفت.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const [detail, setDetail] = React.useState<Job | null>(null)
  const runTask = run.mutate
  const scheduled = React.useMemo(() => (tasks.data ?? NO_TASKS).filter((t) => t.schedule), [tasks.data])

  const columns = React.useMemo<DataTableColumn<Job>[]>(
    () => [
      col.accessor("title", { id: "name", header: "کار", enableSorting: false, meta: { label: "کار", primary: true, wrap: true } }),
      col.accessor("status", {
        header: "وضعیت",
        enableSorting: false,
        meta: {
          label: "وضعیت",
          filterOptions: [
            { value: "done", label: "انجام شد" },
            { value: "failed", label: "ناموفق" },
            { value: "queued", label: "در صف" },
            { value: "running", label: "در حال اجرا" },
          ],
          exportValue: (j) => j.status_label,
        },
        cell: (c) => <JobStatus job={c.row.original} />,
      }),
      col.accessor("created_at", {
        header: "زمان",
        meta: { label: "زمان" },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      col.accessor((j) => duration(j), { id: "duration", header: "مدت", enableSorting: false, meta: { label: "مدت" } }),
      col.accessor("created_by_name", { header: "اجرا توسط", enableSorting: false, meta: { label: "اجرا توسط" } }),
      col.accessor((j) => (j.status === "failed" ? "خطا رخ داد" : j.result), {
        id: "result",
        header: "نتیجه",
        enableSorting: false,
        meta: { label: "نتیجه", wrap: true },
        cell: (c) => <span className={c.row.original.status === "failed" ? "text-destructive" : undefined}>{c.getValue()}</span>,
      }),
      {
        id: "detail",
        size: 44,
        minSize: 44,
        enableHiding: false,
        enableResizing: false,
        meta: { label: "جزئیات" },
        header: () => <span className="sr-only">جزئیات</span>,
        cell: (c) =>
          c.row.original.error && (
            <Button variant="ghost" size="icon-sm" aria-label={`جزئیات خطای ${c.row.original.title}`} onClick={() => setDetail(c.row.original)}>
              <Eye />
            </Button>
          ),
      },
    ],
    [setDetail],
  )
  const taskColumns = React.useMemo<DataTableColumn<TaskInfo>[]>(
    () => [
      taskCol.accessor("title", { header: "کار", meta: { label: "کار", primary: true, wrap: true } }),
      taskCol.accessor("schedule", { header: "زمان‌بندی", enableSorting: false, meta: { label: "زمان‌بندی" } }),
      taskCol.accessor("next_run", {
        header: "اجرای بعدی",
        meta: { label: "اجرای بعدی" },
        cell: (c) => <span className="tabular-nums">{c.getValue() ? formatDateTime(c.getValue()) : "—"}</span>,
      }),
      taskCol.accessor((t) => t.last_job?.status_label ?? "هنوز اجرا نشده", {
        id: "last_job",
        header: "آخرین اجرا",
        enableSorting: false,
        meta: { label: "آخرین اجرا" },
        cell: (c) => {
          const last = c.row.original.last_job
          return last ? (
            <span className="flex flex-wrap items-center gap-2">
              <JobStatus job={last} />
              <span className="text-2xs text-muted-foreground tabular-nums">{formatDateTime(last.created_at)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">هنوز اجرا نشده</span>
          )
        },
      }),
      {
        id: "run",
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        meta: { label: "اجرا" },
        header: () => <span className="sr-only">اجرا</span>,
        cell: (c) => {
          const t = c.row.original
          return (
            <Button variant="outline" size="sm" onClick={() => runTask(t.name)} disabled={!!t.last_job && ACTIVE.has(t.last_job.status)}>
              <Play /> اجرای اکنون
            </Button>
          )
        },
      },
    ],
    [runTask],
  )
  const taskView = useTableView("job-tasks", { urlKey: "t.", defaultSort: "title" })
  const taskTable = useDataTable({ view: taskView, columns: taskColumns, data: scheduled, getRowId: (t) => t.name })
  const table = useDataTable({ view, columns, data: jobs.data?.results ?? EMPTY, rowCount: jobs.data?.count ?? 0, getRowId: (j) => String(j.id) })

  return (
    <>
      <PageHeader
        title="کارهای سامانه"
        description="کارهای پس‌زمینه مثل پشتیبان روزانه و پاک‌سازی، که خود سامانه اجرا می‌کند. کار ناموفق تا سه بار با فاصله دوباره تلاش می‌شود."
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
      />
      <Section title="کارهای دوره‌ای">
        <DataTable
          table={taskTable}
          view={taskView}
          caption="کارهای دوره‌ای"
          compact
          loading={tasks.isPending}
          error={tasks.error}
          onRetry={() => tasks.refetch()}
          empty={{ title: "کار دوره‌ای ثبت نشده است" }}
        />
      </Section>
      <DataTable
        table={table}
        view={view}
        caption="سابقه‌ی اجرای کارها"
        loading={jobs.isFetching && !jobs.data}
        error={jobs.error}
        onRetry={() => jobs.refetch()}
        exportFileName="کارهای سامانه"
        empty={{ title: "هنوز کاری اجرا نشده است" }}
      />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>خطای «{detail?.title}»</DialogTitle>
          </DialogHeader>
          <pre dir="ltr" className="max-h-[60svh] overflow-auto rounded-md bg-muted p-3 text-2xs whitespace-pre-wrap">
            {detail?.error}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  )
}
