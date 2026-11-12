import * as React from "react"
import { Link } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, Pencil, Trash2, Workflow } from "lucide-react"
import { toast } from "sonner"
import { REQUESTS_KEY } from "@/app/workflow"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { InfoTip } from "@/components/info-tip"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"

type Draft = Schemas["Request"]
type Startable = Schemas["StartableProcess"]
const col = columnHelper<Draft>()
const EMPTY: Draft[] = []
const draftUrl = (d: Draft) => `/requests/new/${d.process}?draft=${d.id}`

/** «درخواست جدید»: فرایندهایی که کاربر اجازه‌ی شروعشان را دارد (به تفکیک دسته) و پیش‌نویس‌های نیمه‌کاره‌اش. */
export default function NewRequestPage() {
  const processes = useQuery({ queryKey: ["workflow", "start"], queryFn: () => unwrap(api.GET("/api/workflow/start/")) })
  const drafts = useQuery({
    queryKey: [...REQUESTS_KEY, "drafts"],
    queryFn: () => unwrap(api.GET("/api/workflow/requests/", { params: { query: { status: "draft", page_size: 100 } } })),
  })
  const groups = React.useMemo(() => {
    const map = new Map<string, Startable[]>()
    for (const p of processes.data ?? []) map.set(p.category_title || "سایر درخواست‌ها", [...(map.get(p.category_title || "سایر درخواست‌ها") ?? []), p])
    return [...map.entries()]
  }, [processes.data])
  const draftRows = drafts.data?.results ?? EMPTY

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="درخواست جدید"
        description="درخواست‌هایی که اجازه‌ی ثبتشان را دارید. پس از ثبت، درخواست بر اساس فرایند سازمان برای بررسی فرستاده می‌شود. هنگام پر کردن، پیش‌نویس خودکار ذخیره می‌شود."
      />
      {draftRows.length > 0 && (
        <Section title="پیش‌نویس‌های درخواست" meta={`${formatNumber(draftRows.length)} پیش‌نویس`}>
          <DraftsTable rows={draftRows} loading={drafts.isPending} error={drafts.error} onRetry={() => drafts.refetch()} />
        </Section>
      )}
      {processes.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : groups.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Workflow />
            </EmptyMedia>
            <EmptyTitle>درخواستی برای ثبت ندارید</EmptyTitle>
            <EmptyDescription>
              {processes.error ? errorMessage(processes.error) : "فرایندهایی که سازمان منتشر کند و اجازه‌ی شروعشان را داشته باشید، اینجا می‌آیند."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map(([category, items]) => (
          <Section key={category} title={category} meta={`${formatNumber(items.length)} درخواست`}>
            <ul className="@container grid gap-2 @2xl:grid-cols-2 @6xl:grid-cols-3" aria-label={`درخواست‌های ${category}`}>
              {items.map((p) => (
                <li key={p.id} className="flex items-center gap-1 rounded-md border px-3 py-2 hover:bg-muted/50">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <Link to={`/requests/new/${p.id}`} className="min-w-0 flex-1 truncate py-0.5 text-xs font-medium hover:underline">
                    {p.title}
                  </Link>
                  {p.description && <InfoTip label={`راهنمای ${p.title}`}>{p.description}</InfoTip>}
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </div>
  )
}

function DraftsTable({ rows, loading, error, onRetry }: { rows: Draft[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const qc = useQueryClient()
  const [deleting, setDeleting] = React.useState<Draft | null>(null)
  const remove = useMutation({
    mutationFn: (d: Draft) => unwrap(api.DELETE("/api/workflow/requests/{id}/", { params: { path: { id: d.id } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REQUESTS_KEY })
      toast.success("پیش‌نویس حذف شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const columns = React.useMemo<DataTableColumn<Draft>[]>(
    () => [
      col.accessor("process_title", { header: "درخواست", meta: { label: "درخواست", primary: true } }),
      col.accessor("requester_name", { header: "به نام", meta: { label: "به نام" } }),
      col.accessor("updated_at", {
        header: "آخرین تغییر",
        meta: { label: "آخرین تغییر" },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      actionsColumn<Draft>((d) => (
        <>
          <DropdownMenuItem asChild>
            <Link to={draftUrl(d)}>
              <Pencil /> ادامه‌ی پر کردن
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(d)}>
            <Trash2 /> حذف پیش‌نویس
          </DropdownMenuItem>
        </>
      )),
    ],
    []
  )
  const view = useTableView("request-drafts", { urlKey: "drafts.", defaultSort: "-updated_at" })
  const table = useDataTable({ view, columns, data: rows, getRowId: (d) => String(d.id) })
  return (
    <>
      <DataTable
        table={table}
        view={view}
        caption="پیش‌نویس‌های درخواست"
        loading={loading}
        error={error}
        onRetry={onRetry}
        rowHref={draftUrl}
        exportFileName="پیش‌نویس‌های درخواست"
        empty={{ title: "پیش‌نویسی ندارید" }}
        compact
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="حذف پیش‌نویس"
          description={`پیش‌نویس درخواست «${deleting.process_title}» و فایل‌های پیوست آن حذف می‌شود.`}
          confirmLabel="حذف پیش‌نویس"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </>
  )
}
