import * as React from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { Section } from "@/components/layout/section"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber, toFaDigits } from "@/lib/format"
import { EMPLOYEES_KEY } from "./employees"

type Event = Schemas["EmployeeEvent"]
const col = columnHelper<Event>()
const amount = (value: string, unit: string) => (Number(value) ? `${toFaDigits(String(Number(value)))} ${unit}` : "")

/** «درخواست‌ها و رویدادها»: مرخصی، مأموریت، اضافه‌کار و… که فرایندهای آماده پس از تأیید در پرونده ثبت کرده‌اند. */
export function EventsSection({ employee }: { employee: Schemas["EmployeeDetail"] }) {
  const events = useQuery({
    queryKey: [...EMPLOYEES_KEY, String(employee.id), "events"],
    queryFn: () => unwrap(api.GET("/api/hr/events/", { params: { query: { employee: employee.id } } })),
  })
  const columns = React.useMemo<DataTableColumn<Event>[]>(
    () => [
      col.accessor("kind_label", {
        header: "نوع",
        meta: { label: "نوع", primary: true, wrap: true },
        cell: (c) => {
          const e = c.row.original
          if (e.kind === "leave" && e.title) return `مرخصی ${e.title}`
          return (
            <span className="flex flex-col gap-0.5">
              <span>{c.getValue()}</span>
              {e.title && <span className="text-2xs text-muted-foreground">{toFaDigits(e.title)}</span>}
            </span>
          )
        },
      }),
      col.accessor("start_date", {
        header: "تاریخ",
        meta: { label: "تاریخ" },
        cell: (c) => {
          const e = c.row.original
          const range = e.end_date && e.end_date !== e.start_date ? `${e.start_date} تا ${e.end_date}` : e.start_date
          const time = [e.start_time, e.end_time].filter(Boolean).join(" تا ")
          return <span className="tabular-nums">{toFaDigits(time ? `${range}، ${time}` : range)}</span>
        },
      }),
      col.accessor((e) => Number(e.days) || Number(e.hours), {
        id: "duration",
        header: "مدت",
        meta: { label: "مدت" },
        cell: (c) => {
          const e = c.row.original
          return <span className="tabular-nums">{[amount(e.days, "روز"), e.kind !== "leave" ? amount(e.hours, "ساعت") : ""].filter(Boolean).join("، ") || "—"}</span>
        },
      }),
      col.accessor("amount", {
        header: "مبلغ",
        meta: { label: "مبلغ" },
        cell: (c) => <span className="tabular-nums">{c.getValue() ? `${formatNumber(c.getValue())} ریال` : "—"}</span>,
      }),
      col.accessor("deducts", { header: "از مانده", meta: { label: "از مانده" }, cell: (c) => (c.getValue() ? "کسر شد" : "—") }),
      col.accessor("request_number", {
        header: "درخواست",
        meta: { label: "درخواست" },
        cell: (c) =>
          c.row.original.request ? (
            <Link className="text-primary underline-offset-4 hover:underline" to={`/requests/${c.row.original.request}`}>
              {toFaDigits(c.getValue() || String(c.row.original.request))}
            </Link>
          ) : (
            "—"
          ),
      }),
    ],
    []
  )
  const view = useTableView("hr-events")
  const table = useDataTable({ view, columns, data: events.data ?? [], getRowId: (e) => String(e.id) })
  return (
    <Section
      title="درخواست‌ها و رویدادها"
      description="مرخصی، مأموریت، اضافه‌کار، دورکاری، تغییر شیفت، اصلاح تردد و درخواست‌های مالی (مساعده، وام، درمان، کمک‌هزینه و هزینه‌ی سفر) که پس از تأیید فرایندهای آماده خودکار در پرونده ثبت شده‌اند."
      meta={`مانده‌ی مرخصی استحقاقی امسال: ${toFaDigits(String(employee.leave_balance))} روز`}
    >
      <DataTable
        table={table}
        view={view}
        caption="درخواست‌ها و رویدادها"
        compact
        loading={events.isPending}
        error={events.error}
        onRetry={() => events.refetch()}
        empty={{ title: "هنوز رویدادی ثبت نشده است" }}
      />
    </Section>
  )
}
