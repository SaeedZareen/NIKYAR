import * as React from "react"
import { useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { REQUEST_TONES, REQUESTS_KEY } from "@/app/workflow"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"

type Row = Schemas["ManagedRequest"]
type View = "running" | "unassigned" | "overdue" | "all"
const col = columnHelper<Row>()
const EMPTY: Row[] = []

const VIEWS: { value: View; label: string; empty: string; query: { status?: string; problem?: "unassigned" | "overdue" } }[] = [
  { value: "running", label: "در جریان", empty: "درخواستی در جریان نیست", query: { status: "running" } },
  { value: "unassigned", label: "بی‌گیرنده", empty: "کار بی‌گیرنده‌ای نیست", query: { problem: "unassigned" } },
  { value: "overdue", label: "دیرکرده", empty: "کار دیرکرده‌ای نیست", query: { problem: "overdue" } },
  { value: "all", label: "همه", empty: "درخواستی ثبت نشده است", query: {} },
]

/** مدیریت درخواست‌ها: درخواست‌های فرایندهایی که کاربر مدیرشان است (یا همه با مجوز)، با زبانه‌های بی‌گیرنده و دیرکرده. */
export default function ManageRequestsPage() {
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.some((v) => v.value === params.get("view")) ? params.get("view") : "running") as View
  return (
    <>
      <PageHeader
        title="مدیریت درخواست‌ها"
        description="درخواست‌های فرایندهایی که مدیرشان هستید (با مجوز «مدیریت همه‌ی درخواست‌ها»، همه‌ی فرایندها). با باز کردن هر درخواست، کار را به دیگری ارجاع دهید، به مرحله‌ای گذشته برگردانید، از نو شروع کنید یا با دلیل لغو کنید."
      />
      <Tabs value={view} onValueChange={(v) => setParams(v === "running" ? {} : { view: v }, { replace: true })} className="gap-4">
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {VIEWS.map((v) => (
          <TabsContent key={v.value} value={v.value}>
            {view === v.value && <ManagedTable view={v} />}
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}

function ManagedTable({ view }: { view: (typeof VIEWS)[number] }) {
  const requests = useQuery({ queryKey: [...REQUESTS_KEY, "manage", view.value], queryFn: () => unwrap(api.GET("/api/workflow/manage/", { params: { query: view.query } })) })
  const columns = React.useMemo<DataTableColumn<Row>[]>(
    () => [
      col.accessor("process_title", { header: "درخواست", meta: { label: "درخواست", primary: true } }),
      col.accessor("number", { header: "شماره", meta: { label: "شماره" }, cell: (c) => <span className="tabular-nums">{c.getValue() ? toFaDigits(c.getValue()) : "—"}</span> }),
      col.accessor("requester_name", { header: "درخواست‌دهنده", meta: { label: "درخواست‌دهنده" } }),
      col.accessor("status_label", {
        header: "وضعیت",
        meta: { label: "وضعیت" },
        cell: (c) => (
          <span className="inline-flex flex-wrap gap-1">
            <StatusBadge tone={REQUEST_TONES[c.row.original.status] ?? "neutral"}>{c.getValue()}</StatusBadge>
            {c.row.original.unassigned && <StatusBadge tone="warning">بی‌گیرنده</StatusBadge>}
            {c.row.original.overdue && <StatusBadge tone="destructive">دیرکرد</StatusBadge>}
          </span>
        ),
      }),
      col.accessor("current_step", { header: "مرحله‌ی فعلی", meta: { label: "مرحله‌ی فعلی" }, cell: (c) => c.getValue() || "—" }),
      col.accessor("submitted_at", { header: "زمان ثبت", meta: { label: "زمان ثبت" }, cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span> }),
    ],
    []
  )
  const tableView = useTableView(`manage-requests-${view.value}`, { defaultSort: "-submitted_at" })
  const table = useDataTable({ view: tableView, columns, data: requests.data ?? EMPTY, getRowId: (r) => String(r.id) })
  return (
    <DataTable
      table={table}
      view={tableView}
      caption={`مدیریت درخواست‌ها: ${view.label}`}
      loading={requests.isPending}
      error={requests.error}
      onRetry={() => requests.refetch()}
      rowHref={(r) => `/requests/${r.id}`}
      exportFileName="مدیریت درخواست‌ها"
      empty={{ title: view.empty }}
    />
  )
}
