import * as React from "react"
import { Link, useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, LayoutTemplate, PencilRuler, Plus, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DESIGN_PROCESSES_KEY } from "@/app/workflow"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber, toFaDigits } from "@/lib/format"
import { ProcessSheet } from "./process-sheet"

type Process = Schemas["Process"]
const EMPTY: Process[] = []
const col = columnHelper<Process>()

function statusOf(p: Process) {
  if (!p.is_active) return { label: "غیرفعال", tone: "neutral" as const }
  if (p.published_version === null) return { label: "منتشرنشده", tone: "warning" as const }
  return { label: p.draft_version ? `نسخه‌ی ${toFaDigits(p.published_version)} · پیش‌نویس باز` : `نسخه‌ی ${toFaDigits(p.published_version)}`, tone: "success" as const }
}
const designUrl = (p: Process) => `/workflow/design/${p.id}`

/** «طراحی فرایندها»: فهرست فرایندها برای طراحان؛ فرایند تازه، مشخصات، رونوشت و حذف. */
export default function ProcessDesignPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const processes = useQuery({ queryKey: [...DESIGN_PROCESSES_KEY, "list"], queryFn: () => unwrap(api.GET("/api/workflow/processes/")) })
  const [editing, setEditing] = React.useState<{ process: Process | null } | null>(null)
  const [deleting, setDeleting] = React.useState<Process | null>(null)
  const remove = useMutation({
    mutationFn: (p: Process) => unwrap(api.DELETE("/api/workflow/processes/{id}/", { params: { path: { id: String(p.id) } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESIGN_PROCESSES_KEY })
      toast.success("فرایند حذف شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const fromTemplate = useMutation({
    mutationFn: () => unwrap(api.POST("/api/workflow/processes/from-template/")),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: DESIGN_PROCESSES_KEY })
      toast.success(`فرایند «${created.title}» با فرم «${created.form_title}» ساخته شد؛ گیرنده‌ی مرحله‌های مشخص‌شده با کادر قرمز را تعیین کنید.`)
      navigate(designUrl(created))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const copy = useMutation({
    mutationFn: (p: Process) =>
      unwrap(api.POST("/api/workflow/processes/{id}/copy/", { params: { path: { id: String(p.id) } }, body: { code: `${p.code.slice(0, 28)}-${Date.now().toString(36)}`.slice(0, 40) } })),
    onSuccess: (clone) => {
      qc.invalidateQueries({ queryKey: DESIGN_PROCESSES_KEY })
      toast.success(`فرایند «${clone.title}» ساخته شد.`)
      navigate(designUrl(clone))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const columns = React.useMemo<DataTableColumn<Process>[]>(
    () => [
      col.accessor("title", { header: "عنوان", meta: { label: "عنوان", primary: true, wrap: true } }),
      col.accessor("code", { header: "شناسه", meta: { label: "شناسه" }, cell: (c) => <bdi dir="ltr">{c.getValue()}</bdi> }),
      col.accessor("form_title", { header: "فرم اصلی", meta: { label: "فرم اصلی", wrap: true } }),
      col.accessor((p) => p.category_title || "—", { id: "category", header: "دسته", meta: { label: "دسته" } }),
      col.accessor((p) => statusOf(p).label, {
        id: "status",
        header: "وضعیت",
        enableSorting: false,
        meta: { label: "وضعیت" },
        cell: (c) => <StatusBadge tone={statusOf(c.row.original).tone}>{c.getValue()}</StatusBadge>,
      }),
      col.accessor("request_count", {
        header: "درخواست‌ها",
        sortFn: "basic",
        meta: { label: "درخواست‌ها", align: "end" },
        cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span>,
      }),
      actionsColumn<Process>((p) => (
        <>
          <DropdownMenuItem asChild>
            <Link to={designUrl(p)}>
              <PencilRuler /> طراحی
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing({ process: p })}>
            <Settings2 /> مشخصات
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy.mutate(p)}>
            <Copy /> رونوشت
          </DropdownMenuItem>
          {p.request_count === 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                <Trash2 /> حذف
              </DropdownMenuItem>
            </>
          )}
        </>
      )),
    ],
    [copy]
  )
  const view = useTableView("process-design", { defaultSort: "title" })
  const table = useDataTable({ view, columns, data: processes.data ?? EMPTY, getRowId: (p) => String(p.id) })
  return (
    <>
      <PageHeader
        title="طراحی فرایندها"
        description="مسیر اداری درخواست‌ها: مرحله‌ها، گیرنده‌ی هر مرحله و مسیرهای شرطی، روی فرمی از فرم‌ساز. پس از انتشار، کاربران مجاز درخواست تازه شروع می‌کنند."
        actions={
          <>
            <Button variant="outline" disabled={fromTemplate.isPending} onClick={() => fromTemplate.mutate()}>
              <LayoutTemplate /> الگوی درخواست خرید
            </Button>
            <Button onClick={() => setEditing({ process: null })}>
              <Plus /> فرایند جدید
            </Button>
          </>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="فرایندها"
        loading={processes.isPending}
        error={processes.error}
        onRetry={() => processes.refetch()}
        rowHref={designUrl}
        searchPlaceholder="عنوان، شناسه یا فرم"
        exportFileName="فرایندها"
        empty={{ title: "هنوز فرایندی نساخته‌اید", description: "«فرایند جدید» را بزنید؛ ابتدا فرم درخواست را در فرم‌ساز بسازید و منتشر کنید." }}
      />
      {editing && <ProcessSheet key={editing.process?.id ?? "new"} process={editing.process} open onOpenChange={(o) => !o && setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="حذف فرایند"
          description={`فرایند «${deleting.title}» و همه‌ی نسخه‌هایش حذف می‌شود.`}
          confirmLabel="حذف فرایند"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </>
  )
}
