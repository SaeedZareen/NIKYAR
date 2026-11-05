import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowLeft, Eye } from "lucide-react"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { DescriptionList } from "@/components/description-list"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge, type StatusTone } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"

type Log = Schemas["AuditLog"]
const EMPTY: Log[] = []
const col = columnHelper<Log>()

const ACTIONS: { value: Log["action"]; label: string; tone: StatusTone }[] = [
  { value: "create", label: "ایجاد", tone: "success" },
  { value: "update", label: "ویرایش", tone: "info" },
  { value: "delete", label: "حذف", tone: "destructive" },
  { value: "login", label: "ورود", tone: "neutral" },
  { value: "logout", label: "خروج", tone: "neutral" },
  { value: "login_failed", label: "ورود ناموفق", tone: "warning" },
]
const TONE = Object.fromEntries(ACTIONS.map((a) => [a.value, a.tone])) as Record<Log["action"], StatusTone>

export default function AuditPage() {
  const view = useTableView("audit", { defaultSort: "-at" })
  const logs = useQuery({
    queryKey: ["audit", view.query],
    queryFn: () => unwrap(api.GET("/api/audit/logs/", { params: { query: view.query } })),
    placeholderData: keepPreviousData,
  })
  const [detail, setDetail] = React.useState<Log | null>(null)

  const columns = React.useMemo<DataTableColumn<Log>[]>(
    () => [
      col.accessor("at", {
        header: "زمان",
        meta: { label: "زمان", exportValue: (l) => formatDateTime(l.at) },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      col.accessor("user_name", { header: "کاربر", enableSorting: false, meta: { label: "کاربر", wrap: true } }),
      col.accessor("action", {
        header: "عمل",
        meta: { label: "عمل", filterOptions: ACTIONS.map(({ value, label }) => ({ value, label })), exportValue: (l) => l.action_label },
        cell: (c) => <StatusBadge tone={TONE[c.row.original.action]}>{c.row.original.action_label}</StatusBadge>,
      }),
      col.accessor("model_label", { header: "نوع", meta: { label: "نوع" } }),
      col.accessor("object_repr", { header: "مورد", meta: { label: "مورد", primary: true, wrap: true } }),
      col.accessor("ip", {
        header: "نشانی IP",
        enableSorting: false,
        meta: { label: "نشانی IP" },
        cell: (c) => <bdi dir="ltr">{c.getValue() ?? "—"}</bdi>,
      }),
      col.display({
        id: "detail",
        size: 44,
        minSize: 44,
        enableHiding: false,
        enableResizing: false,
        meta: { label: "جزئیات" },
        header: () => <span className="sr-only">جزئیات</span>,
        cell: (c) =>
          Object.keys(c.row.original.changes).length > 0 && (
            <Button variant="ghost" size="icon-sm" aria-label={`جزئیات تغییرات ${c.row.original.object_repr}`} onClick={() => setDetail(c.row.original)}>
              <Eye />
            </Button>
          ),
      }),
    ],
    []
  )
  const table = useDataTable({ view, columns, data: logs.data?.results ?? EMPTY, rowCount: logs.data?.count ?? 0, getRowId: (l) => String(l.id) })

  return (
    <>
      <PageHeader title="سوابق تغییرات" description="هر ایجاد، ویرایش، حذف و ورود: چه کسی، چه زمانی، از چه مقداری به چه مقداری" breadcrumbs={[{ label: "مدیریت سامانه" }]} />
      <DataTable
        table={table}
        view={view}
        caption="سوابق تغییرات"
        loading={logs.isFetching}
        error={logs.error}
        onRetry={() => logs.refetch()}
        searchPlaceholder="مورد، نوع یا نام کاربر"
        exportFileName="سوابق-تغییرات"
        empty={{ title: "هنوز سابقه‌ای ثبت نشده است" }}
      />
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="left" className="gap-0 p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-md">
          {detail && (
            <>
              <SheetHeader className="border-b bg-muted/50 py-3">
                <SheetTitle className="text-sm">
                  {detail.action_label} {detail.model_label} «{detail.object_repr}»
                </SheetTitle>
                <SheetDescription>
                  {detail.user_name} · {formatDateTime(detail.at)}
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto p-4">
                <DescriptionList
                  className="sm:grid-cols-1"
                  items={Object.values(detail.changes).map((c) => ({
                    label: c.label,
                    value: (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{c.old || "خالی"}</span>
                        <ArrowLeft className="size-3.5 text-muted-foreground" aria-label="به" />
                        <span>{c.new || "خالی"}</span>
                      </span>
                    ),
                  }))}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
