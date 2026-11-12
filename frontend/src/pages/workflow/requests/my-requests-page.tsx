import * as React from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { FilePlus2 } from "lucide-react"
import { REQUEST_TONES, REQUESTS_KEY } from "@/app/workflow"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"

type Row = Schemas["Request"]
const col = columnHelper<Row>()
const EMPTY: Row[] = []

/** «درخواست‌های من»: درخواست‌هایی که ثبت کرده‌ام یا به نامم ثبت شده (بی پیش‌نویس‌ها) با وضعیت و مرحله‌ی فعلی. */
export default function MyRequestsPage() {
  const requests = useQuery({
    queryKey: [...REQUESTS_KEY, "mine"],
    queryFn: () => unwrap(api.GET("/api/workflow/requests/", { params: { query: { status: "running,completed,rejected,cancelled", page_size: 500 } } })),
  })
  const columns = React.useMemo<DataTableColumn<Row>[]>(
    () => [
      col.accessor("process_title", { header: "درخواست", meta: { label: "درخواست", primary: true } }),
      col.accessor("number", { header: "شماره", meta: { label: "شماره" }, cell: (c) => <span className="tabular-nums">{c.getValue() ? toFaDigits(c.getValue()) : "—"}</span> }),
      col.accessor("status_label", {
        header: "وضعیت",
        meta: { label: "وضعیت" },
        cell: (c) => <StatusBadge tone={REQUEST_TONES[c.row.original.status] ?? "neutral"}>{c.getValue()}</StatusBadge>,
      }),
      col.accessor("current_step", { header: "مرحله‌ی فعلی", meta: { label: "مرحله‌ی فعلی" }, cell: (c) => c.getValue() || "—" }),
      col.accessor("requester_name", { header: "به نام", meta: { label: "به نام" } }),
      col.accessor("submitted_at", { header: "زمان ثبت", meta: { label: "زمان ثبت" }, cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span> }),
    ],
    []
  )
  const view = useTableView("my-requests", { defaultSort: "-submitted_at" })
  const table = useDataTable({ view, columns, data: requests.data?.results ?? EMPTY, getRowId: (r) => String(r.id) })
  return (
    <>
      <PageHeader
        title="درخواست‌های من"
        description="درخواست‌هایی که ثبت کرده‌اید یا به نام شما ثبت شده است. با باز کردن هر درخواست، مرحله‌ی فعلی، نمودار، گفت‌وگو و تاریخچه را می‌بینید. پیش‌نویس‌ها در «درخواست جدید» هستند."
        actions={
          <Button asChild variant="outline">
            <Link to="/requests/new">
              <FilePlus2 /> درخواست جدید
            </Link>
          </Button>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="درخواست‌های من"
        loading={requests.isPending}
        error={requests.error}
        onRetry={() => requests.refetch()}
        rowHref={(r) => `/requests/${r.id}`}
        exportFileName="درخواست‌های من"
        empty={{ title: "هنوز درخواستی ثبت نکرده‌اید" }}
      />
    </>
  )
}
