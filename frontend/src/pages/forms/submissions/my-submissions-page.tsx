import * as React from "react"
import { Link } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Eye, Pencil, PencilLine, Printer } from "lucide-react"
import { SUBMISSIONS_KEY } from "@/app/forms"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"
import { editUrl, printUrl, submissionUrl } from "./links"

type Submission = Schemas["FormSubmission"]
const EMPTY: Submission[] = []
const col = columnHelper<Submission>()

/** «ثبت‌های من»: همه‌ی ثبت‌ها و پیش‌نویس‌های کاربر، با جست‌وجو و صفحه‌بندی سمت سرور. */
export default function MySubmissionsPage() {
  const view = useTableView("my-submissions", { defaultSort: "-updated_at" })
  const submissions = useQuery({
    queryKey: [...SUBMISSIONS_KEY, "mine", view.query],
    queryFn: () => unwrap(api.GET("/api/forms/submissions/", { params: { query: { ...view.query, mine: true } } })),
    placeholderData: keepPreviousData,
  })
  const columns = React.useMemo<DataTableColumn<Submission>[]>(
    () => [
      col.accessor("form_title", { header: "فرم", enableSorting: false, meta: { label: "فرم", primary: true, wrap: true } }),
      col.accessor("number", {
        header: "شماره",
        meta: { label: "شماره" },
        cell: (c) => (c.getValue() ? <span className="tabular-nums">{toFaDigits(c.getValue())}</span> : <span className="text-muted-foreground">—</span>),
      }),
      col.accessor("status", {
        header: "وضعیت",
        enableSorting: false,
        meta: {
          label: "وضعیت",
          filterOptions: [
            { value: "submitted", label: "ثبت نهایی" },
            { value: "draft", label: "پیش‌نویس" },
          ],
          exportValue: (s) => s.status_label,
        },
        cell: (c) => <StatusBadge tone={c.getValue() === "draft" ? "neutral" : "success"}>{c.row.original.status_label}</StatusBadge>,
      }),
      col.accessor("submitted_at", {
        header: "زمان ثبت",
        meta: { label: "زمان ثبت", exportValue: (s) => (s.submitted_at ? formatDateTime(s.submitted_at) : "") },
        cell: (c) => (c.getValue() ? <span className="tabular-nums">{formatDateTime(c.getValue())}</span> : <span className="text-muted-foreground">—</span>),
      }),
      col.accessor("updated_at", {
        header: "آخرین تغییر",
        meta: { label: "آخرین تغییر", exportValue: (s) => formatDateTime(s.updated_at) },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      actionsColumn<Submission>((s) =>
        s.status === "draft" ? (
          <DropdownMenuItem asChild>
            <Link to={submissionUrl(s)}>
              <Pencil /> ادامه‌ی پر کردن
            </Link>
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link to={submissionUrl(s)}>
                <Eye /> مشاهده
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={printUrl(s)} target="_blank" rel="noopener">
                <Printer /> چاپ
              </a>
            </DropdownMenuItem>
            {s.editable_until && (
              <DropdownMenuItem asChild>
                <Link to={editUrl(s)}>
                  <PencilLine /> ویرایش
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )
      ),
    ],
    []
  )
  const table = useDataTable({ view, columns, data: submissions.data?.results ?? EMPTY, rowCount: submissions.data?.count ?? 0, getRowId: (s) => String(s.id) })
  return (
    <>
      <PageHeader
        title="ثبت‌های من"
        description="فرم‌هایی که پر کرده‌اید و پیش‌نویس‌های نیمه‌کاره. ثبت نهایی را می‌توانید ببینید و چاپ کنید؛ اگر فرم ویرایش پس از ثبت را اجازه دهد، تا پایان مهلت ویرایشش هم می‌کنید."
        breadcrumbs={[{ label: "فرم‌ها", to: "/forms" }]}
      />
      <DataTable
        table={table}
        view={view}
        caption="ثبت‌های من"
        loading={submissions.isFetching}
        error={submissions.error}
        onRetry={() => submissions.refetch()}
        rowHref={submissionUrl}
        searchPlaceholder="عنوان فرم یا شماره"
        exportFileName="ثبت‌های من"
        empty={{ title: "هنوز فرمی پر نکرده‌اید" }}
      />
    </>
  )
}
