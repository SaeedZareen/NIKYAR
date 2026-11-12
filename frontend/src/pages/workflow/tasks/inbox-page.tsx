import * as React from "react"
import { useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { TASKS_KEY, useTaskCounts } from "@/app/workflow"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber, toFaDigits } from "@/lib/format"

type Row = Schemas["InboxTask"]
type Box = "mine" | "group" | "delegated" | "done"
const col = columnHelper<Row>()
const EMPTY: Row[] = []

const BOXES: { value: Box; label: string; empty: string }[] = [
  { value: "mine", label: "منتظر من", empty: "کاری منتظر شما نیست" },
  { value: "group", label: "گروهی", empty: "کار گروهی برداشتنی نیست" },
  { value: "delegated", label: "جانشینی", empty: "کاری از کسانی که جانشینشان هستید منتظر نیست" },
  { value: "done", label: "انجام‌شده", empty: "هنوز کاری انجام نداده‌اید" },
]

/** کارتابل: کارهای منتظر من، کارهای گروهی برداشتنی، کارهای جانشینی و کارهای انجام‌شده؛ زبانه در نشانی صفحه. */
export default function InboxPage() {
  const [params, setParams] = useSearchParams()
  const box = (BOXES.some((b) => b.value === params.get("box")) ? params.get("box") : "mine") as Box
  const counts = useTaskCounts().data
  return (
    <>
      <PageHeader
        title="کارتابل"
        description="کارهایی که در فرایندها به شما رسیده است. کار گروهی به چند نفر می‌رسد؛ با «برداشتن»، کار برای شما می‌ماند تا دیگران هم‌زمان روی آن کار نکنند."
      />
      <Tabs value={box} onValueChange={(b) => setParams(b === "mine" ? {} : { box: b }, { replace: true })} className="gap-4">
        <TabsList>
          {BOXES.map((b) => {
            const n = b.value === "done" ? 0 : (counts?.[b.value] ?? 0)
            return (
              <TabsTrigger key={b.value} value={b.value}>
                {b.label}
                {n > 0 && <span className="rounded-full bg-primary px-1.5 text-2xs text-primary-foreground tabular-nums">{formatNumber(n)}</span>}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {BOXES.map((b) => (
          <TabsContent key={b.value} value={b.value}>
            {box === b.value && <BoxTable box={b.value} empty={b.empty} />}
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}

function BoxTable({ box, empty }: { box: Box; empty: string }) {
  const tasks = useQuery({ queryKey: [...TASKS_KEY, "box", box], queryFn: () => unwrap(api.GET("/api/workflow/tasks/", { params: { query: { box } } })), refetchInterval: 60_000 })
  const done = box === "done"
  const columns = React.useMemo<DataTableColumn<Row>[]>(
    () => [
      col.accessor("title", { header: "مرحله", meta: { label: "مرحله", primary: true } }),
      col.accessor("process_title", { header: "فرایند", meta: { label: "فرایند" } }),
      col.accessor("number", {
        header: "شماره",
        meta: { label: "شماره" },
        cell: (c) => <span className="tabular-nums">{c.getValue() ? toFaDigits(c.getValue()) : "—"}</span>,
      }),
      col.accessor("requester_name", { header: "درخواست‌دهنده", meta: { label: "درخواست‌دهنده" } }),
      ...(done
        ? [
            col.accessor("decision_label", {
              header: "تصمیم",
              meta: { label: "تصمیم" },
              cell: (c) => (
                <span>
                  {c.getValue()}
                  {c.row.original.on_behalf_of_name && <span className="text-2xs text-muted-foreground"> (به نیابت از {c.row.original.on_behalf_of_name})</span>}
                </span>
              ),
            }),
            col.accessor("completed_at", {
              header: "زمان انجام",
              meta: { label: "زمان انجام" },
              cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
            }),
          ]
        : [
            col.accessor("created_at", {
              header: "زمان رسیدن",
              meta: { label: "زمان رسیدن" },
              cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
            }),
            col.accessor("claimed_by_name", {
              header: "وضعیت",
              meta: { label: "وضعیت" },
              enableSorting: false,
              cell: (c) =>
                c.row.original.group ? (
                  <StatusBadge tone={c.getValue() ? "success" : "neutral"}>{c.getValue() ? "برداشته‌شده" : "گروهی"}</StatusBadge>
                ) : (
                  <StatusBadge tone="info">منتظر</StatusBadge>
                ),
            }),
          ]),
    ],
    [done]
  )
  const view = useTableView(`inbox-${box}`, { defaultSort: done ? "-completed_at" : "created_at" })
  const table = useDataTable({ view, columns, data: tasks.data ?? EMPTY, getRowId: (t) => String(t.id) })
  return (
    <DataTable
      table={table}
      view={view}
      caption={`کارتابل: ${BOXES.find((b) => b.value === box)?.label}`}
      loading={tasks.isPending}
      error={tasks.error}
      onRetry={() => tasks.refetch()}
      rowHref={(t) => `/tasks/${t.id}`}
      exportFileName="کارتابل"
      empty={{ title: empty }}
    />
  )
}
