import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"

type ViewableForm = Schemas["ViewableForm"]
const EMPTY: ViewableForm[] = []
const col = columnHelper<ViewableForm>()
const reportUrl = (f: ViewableForm) => `/forms/reports/${f.id}`

/** «ثبت‌های فرم‌ها»: فرم‌هایی که کاربر (طراح یا نقش بیننده) ثبت‌هایشان را می‌بیند. */
export default function FormReportsPage() {
  const forms = useQuery({ queryKey: ["forms", "viewable"], queryFn: () => unwrap(api.GET("/api/forms/viewable/")) })
  const columns = React.useMemo<DataTableColumn<ViewableForm>[]>(
    () => [
      col.accessor("title", { header: "فرم", meta: { label: "فرم", primary: true, wrap: true } }),
      col.accessor((f) => f.category_title || "سایر فرم‌ها", { id: "category", header: "دسته", meta: { label: "دسته" } }),
      col.accessor("submission_count", {
        header: "ثبت‌ها",
        sortFn: "basic",
        meta: { label: "ثبت‌ها", align: "end" },
        cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span>,
      }),
      col.accessor("last_submitted_at", {
        header: "آخرین ثبت",
        sortFn: "basic",
        meta: { label: "آخرین ثبت", exportValue: (f) => (f.last_submitted_at ? formatDateTime(f.last_submitted_at) : "") },
        cell: (c) => (c.getValue() ? <span className="tabular-nums">{formatDateTime(c.getValue())}</span> : <span className="text-muted-foreground">هنوز ثبتی ندارد</span>),
      }),
      col.accessor((f) => String(f.is_active), {
        id: "is_active",
        header: "وضعیت",
        enableSorting: false,
        meta: {
          label: "وضعیت",
          filterOptions: [
            { value: "true", label: "فعال" },
            { value: "false", label: "غیرفعال" },
          ],
          exportValue: (f) => (f.is_active ? "فعال" : "غیرفعال"),
        },
        cell: (c) => <StatusBadge tone={c.row.original.is_active ? "success" : "neutral"}>{c.row.original.is_active ? "فعال" : "غیرفعال"}</StatusBadge>,
      }),
    ],
    []
  )
  const view = useTableView("form-reports", { defaultSort: "-last_submitted_at" })
  const table = useDataTable({ view, columns, data: forms.data ?? EMPTY, getRowId: (f) => String(f.id) })
  return (
    <>
      <PageHeader
        title="ثبت‌های فرم‌ها"
        description="فرم‌هایی که اجازه‌ی دیدن ثبت‌هایشان را دارید (طراحان فرم همه‌ی فرم‌ها را می‌بینند؛ دیگران با «نقش‌های بیننده» در تنظیمات هر فرم). فرم را باز کنید تا ثبت‌هایش را با ستون‌های همان فرم ببینید، جست‌وجو و فیلتر کنید و خروجی اکسل بگیرید."
        breadcrumbs={[{ label: "فرم‌ها", to: "/forms" }]}
      />
      <DataTable
        table={table}
        view={view}
        caption="فرم‌ها و ثبت‌هایشان"
        loading={forms.isPending}
        error={forms.error}
        onRetry={() => forms.refetch()}
        rowHref={reportUrl}
        searchPlaceholder="عنوان یا دسته‌ی فرم"
        exportFileName="ثبت‌های فرم‌ها"
        empty={{ title: "فرمی برای دیدن ثبت‌ها ندارید" }}
      />
    </>
  )
}
