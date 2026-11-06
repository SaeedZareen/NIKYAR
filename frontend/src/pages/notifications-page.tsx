import * as React from "react"
import { useNavigate } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Check, CheckCheck, ExternalLink } from "lucide-react"
import { NOTIFICATIONS_KEY, useMarkAllRead, useMarkRead, useUnreadCount, type Notification } from "@/app/notifications"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api, unwrap } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

const EMPTY: Notification[] = []
const col = columnHelper<Notification>()

export default function NotificationsPage() {
  const navigate = useNavigate()
  const view = useTableView("notifications")
  const list = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "list", view.query],
    queryFn: () => unwrap(api.GET("/api/notifications/", { params: { query: view.query } })),
    placeholderData: keepPreviousData,
  })
  const unread = useUnreadCount().data ?? 0
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const read = markRead.mutate
  const go = navigate

  const columns = React.useMemo<DataTableColumn<Notification>[]>(
    () => [
      col.accessor("text", {
        header: "اعلان",
        enableSorting: false,
        meta: { label: "اعلان", primary: true, wrap: true },
        cell: (c) => <span className={cn(!c.row.original.is_read && "font-semibold")}>{c.getValue()}</span>,
      }),
      col.accessor("created_at", {
        header: "زمان",
        enableSorting: false,
        meta: { label: "زمان" },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      col.accessor((n) => String(!n.is_read), {
        id: "unread",
        header: "وضعیت",
        enableSorting: false,
        meta: { label: "وضعیت", filterOptions: [{ value: "true", label: "خوانده‌نشده" }], exportValue: (n) => (n.is_read ? "خوانده‌شده" : "خوانده‌نشده") },
        cell: (c) => <StatusBadge tone={c.row.original.is_read ? "neutral" : "info"}>{c.row.original.is_read ? "خوانده‌شده" : "خوانده‌نشده"}</StatusBadge>,
      }),
      actionsColumn<Notification>((n) => (
        <>
          {n.url && (
            <DropdownMenuItem
              onSelect={() => {
                if (!n.is_read) read(n.id)
                go(n.url)
              }}
            >
              <ExternalLink /> باز کردن
            </DropdownMenuItem>
          )}
          {!n.is_read && (
            <DropdownMenuItem onSelect={() => read(n.id)}>
              <Check /> خوانده شد
            </DropdownMenuItem>
          )}
        </>
      )),
    ],
    [read, go]
  )
  const table = useDataTable({ view, columns, data: list.data?.results ?? EMPTY, rowCount: list.data?.count ?? 0, getRowId: (n) => String(n.id) })

  return (
    <>
      <PageHeader
        title="اعلان‌ها"
        meta={unread ? `${formatNumber(unread)} اعلان خوانده‌نشده` : "همه‌ی اعلان‌ها خوانده شده‌اند."}
        actions={
          <Button variant="outline" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
            <CheckCheck /> همه خوانده شد
          </Button>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="اعلان‌های من"
        loading={list.isFetching && !list.data}
        error={list.error}
        onRetry={() => list.refetch()}
        exportFileName="اعلان‌ها"
        empty={{ title: "اعلانی ندارید" }}
      />
    </>
  )
}
