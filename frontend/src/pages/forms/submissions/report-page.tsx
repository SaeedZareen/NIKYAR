import * as React from "react"
import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Eye, Printer } from "lucide-react"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { isDisplay, type FieldDef, type FormDefinition } from "@/components/form-renderer/definition"
import { fieldText, useNames, type Names } from "@/components/form-renderer/value-text"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber, toFaDigits } from "@/lib/format"
import { printUrl, submissionUrl } from "./links"

type Submission = Schemas["FormSubmission"]
type Report = Schemas["FormReport"]
const col = columnHelper<Submission>()
const EMPTY: Submission[] = []

/** ستون‌های فیلد پس از این تعداد پنهان‌اند تا کاربر از «ستون‌ها» نمایانشان کند. */
const VISIBLE_FIELDS = 6
/** مقدارهای عددی و تاریخی خام می‌مانند تا درست مرتب شوند و در اکسل عدد باشند. */
const NUMERIC = new Set(["number", "amount", "scale"])
const RAW_TEXT = new Set(["date", "time", "datetime"])

const fieldColumnId = (field: FieldDef) => `v_${field.id}`

/** فیلدهای ستون‌شدنی: فیلدهای مقدارپذیر سطح بخش (گروه تکرارشونده با شمار ردیف‌ها). */
function reportFields(definition: FormDefinition): FieldDef[] {
  return definition.sections.flatMap((s) => s.fields).filter((f) => !isDisplay(f))
}

function fieldColumn(field: FieldDef, names: Names): DataTableColumn<Submission> {
  const label = field.label || field.id
  const text = (s: Submission) => fieldText(field, s.data[field.id], names)
  if (NUMERIC.has(field.type)) {
    return col.accessor((s) => (typeof s.data[field.id] === "number" ? (s.data[field.id] as number) : undefined), {
      id: fieldColumnId(field),
      header: label,
      sortFn: "basic",
      sortUndefined: "last",
      meta: { label, align: "end" },
      cell: (c) => <span className="tabular-nums">{text(c.row.original) || <span className="text-muted-foreground">—</span>}</span>,
    })
  }
  if (RAW_TEXT.has(field.type)) {
    return col.accessor((s) => String(s.data[field.id] ?? ""), {
      id: fieldColumnId(field),
      header: label,
      meta: { label },
      cell: (c) => (c.getValue() ? <span className="tabular-nums">{toFaDigits(c.getValue())}</span> : <span className="text-muted-foreground">—</span>),
    })
  }
  const options =
    field.type === "choice"
      ? ((field.props?.options ?? []) as { label: string }[]).map((o) => ({ value: o.label, label: o.label }))
      : field.type === "boolean"
        ? [
            { value: "بله", label: "بله" },
            { value: "خیر", label: "خیر" },
          ]
        : undefined
  return col.accessor(text, {
    id: fieldColumnId(field),
    header: label,
    enableSorting: field.type !== "table",
    meta: { label, wrap: true, filterOptions: options },
    cell: (c) => c.getValue() || <span className="text-muted-foreground">—</span>,
  })
}

/** ثبت‌های نهایی یک فرم با ستون‌هایی از فیلدهای همان فرم؛ جست‌وجو، فیلتر و خروجی اکسل در مرورگر. */
export default function FormReportPage() {
  const formId = useParams().formId ?? ""
  const report = useQuery({ queryKey: ["forms", "report", formId], queryFn: () => unwrap(api.GET("/api/forms/{id}/report/", { params: { path: { id: formId } } })) })
  if (!report.data) {
    return (
      <>
        <PageHeader title="ثبت‌های فرم" breadcrumbs={[{ label: "ثبت‌های فرم‌ها", to: "/forms/reports" }]} />
        {report.error ? <ReportTable report={null} error={report.error} onRetry={() => report.refetch()} /> : <Skeleton className="h-64 w-full" />}
      </>
    )
  }
  return <ReportTable key={formId} report={report.data} onRetry={() => report.refetch()} loading={report.isFetching} />
}

function ReportTable({ report, error, onRetry, loading }: { report: Report | null; error?: unknown; onRetry: () => void; loading?: boolean }) {
  const definition = report?.definition as FormDefinition | undefined
  const rows = report?.submissions ?? EMPTY
  const fields = React.useMemo(() => (definition ? reportFields(definition) : []), [definition])
  const data = React.useMemo(() => rows.map((s) => s.data), [rows])
  const names = useNames(definition, data)
  const columns = React.useMemo<DataTableColumn<Submission>[]>(
    () => [
      col.accessor((s) => s.number || `ثبت ${toFaDigits(s.id)}`, {
        id: "number",
        header: "شماره",
        meta: { label: "شماره", primary: true, exportValue: (s) => s.number },
        cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span>,
      }),
      col.accessor((s) => s.submitted_at ?? "", {
        id: "submitted_at",
        header: "زمان ثبت",
        sortFn: "basic",
        meta: { label: "زمان ثبت", exportValue: (s) => formatDateTime(s.submitted_at) },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      ...(report?.anonymous ? [] : [col.accessor("created_by_name", { header: "ثبت‌کننده", meta: { label: "ثبت‌کننده", wrap: true } })]),
      col.accessor("version_number", {
        header: "نسخه‌ی فرم",
        sortFn: "basic",
        meta: { label: "نسخه‌ی فرم", align: "end" },
        cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span>,
      }),
      ...fields.map((f) => fieldColumn(f, names)),
      actionsColumn<Submission>((s) => (
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
        </>
      )),
    ],
    [fields, names, report?.anonymous]
  )
  const defaultHidden = React.useMemo(() => ["version_number", ...fields.slice(VISIBLE_FIELDS).map(fieldColumnId)], [fields])
  const view = useTableView(`form-report-${report?.form ?? "none"}`, { defaultSort: "-submitted_at", defaultHidden })
  const table = useDataTable({ view, columns, data: rows, getRowId: (s) => String(s.id) })
  const title = report?.title ?? "ثبت‌های فرم"
  return (
    <>
      {report && (
        <PageHeader
          title={title}
          description="ثبت‌های نهایی این فرم؛ ستون‌ها از فیلدهای آخرین نسخه‌ی منتشرشده‌اند. ستون‌های بیشتر را از «ستون‌ها» نمایان کنید؛ خروجی اکسل همان ستون‌های نمایان و ردیف‌های فیلترشده را دارد."
          meta={
            report.truncated
              ? `فقط ${formatNumber(rows.length)} ثبت تازه‌تر نمایش داده می‌شود.`
              : `${formatNumber(rows.length)} ثبت نهایی`
          }
          breadcrumbs={[{ label: "ثبت‌های فرم‌ها", to: "/forms/reports" }]}
        />
      )}
      <DataTable
        table={table}
        view={view}
        caption={`ثبت‌های ${title}`}
        loading={loading}
        error={error}
        onRetry={onRetry}
        rowHref={submissionUrl}
        searchPlaceholder="جست‌وجو در همه‌ی ستون‌ها"
        exportFileName={title}
        empty={{ title: "این فرم هنوز ثبت نهایی ندارد" }}
      />
    </>
  )
}
