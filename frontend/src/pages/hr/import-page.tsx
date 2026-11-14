import * as React from "react"
import { useNavigate } from "react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Download, Eye, Upload } from "lucide-react"
import { toast } from "sonner"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { FilePicker } from "@/components/files/file-picker"
import { FormGrid } from "@/components/form/form-grid"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"
import { EMPLOYEES_KEY } from "./employees"

type Inspect = Schemas["EmployeeImportInspectResult"]
type Result = Schemas["EmployeeImportResult"]
type Row = Schemas["EmployeeImportRow"]
const IGNORE = "__ignore__"
const ACTIONS: Record<Row["action"], { label: string; tone: "success" | "info" | "destructive" }> = {
  create: { label: "پرونده‌ی تازه", tone: "success" },
  update: { label: "به‌روزرسانی", tone: "info" },
  error: { label: "خطا", tone: "destructive" },
}

/** فرم چندبخشی ورود: فایل، نگاشت ستون‌ها و commit (پیش‌نمایش یا ثبت). */
function multipart(file: File, mapping?: Record<string, string>, commit?: boolean) {
  return () => {
    const data = new FormData()
    data.append("file", file)
    if (mapping) data.append("mapping", JSON.stringify(mapping))
    if (commit !== undefined) data.append("commit", String(commit))
    return data
  }
}

/** «ورود از اکسل»: انتخاب فایل، نگاشت سرستون‌ها به فیلدهای پرونده، پیش‌نمایش با خطای هر ردیف و ثبت ردیف‌های درست. */
export default function EmployeesImportPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [file, setFile] = React.useState<File | null>(null)
  const [inspect, setInspect] = React.useState<Inspect | null>(null)
  const [mapping, setMapping] = React.useState<Record<string, string>>({})
  const [result, setResult] = React.useState<Result | null>(null)

  const read = useMutation({
    mutationFn: (f: File) => unwrap(api.POST("/api/hr/employees/import/inspect/", { body: { file: "" }, bodySerializer: multipart(f) })),
    onSuccess: (data) => {
      setInspect(data)
      setMapping(data.suggested)
      setResult(null)
    },
    onError: (e) => {
      setInspect(null)
      toast.error(errorMessage(e))
    },
  })
  const run = useMutation({
    mutationFn: (commit: boolean) =>
      unwrap(api.POST("/api/hr/employees/import/", { body: { file: "", mapping: {}, commit }, bodySerializer: multipart(file as File, mapping, commit) })),
    onSuccess: (data, commit) => {
      if (!commit) return setResult(data)
      qc.invalidateQueries({ queryKey: EMPLOYEES_KEY })
      toast.success(`${toFaDigits(data.counts.create)} پرونده‌ی تازه ساخته و ${toFaDigits(data.counts.update)} پرونده به‌روز شد.`)
      navigate("/hr/employees")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const choose = (f: File | null) => {
    setFile(f)
    setResult(null)
    if (f) read.mutate(f)
    else setInspect(null)
  }
  const setColumn = (header: string, key: string) => {
    setResult(null)
    setMapping((m) => {
      const next = { ...m }
      if (key === IGNORE) delete next[header]
      else next[header] = key
      return next
    })
  }
  const valid = result ? result.counts.create + result.counts.update : 0

  return (
    <>
      <PageHeader
        title="ورود پرونده‌ها از اکسل"
        description="کد ملی کلید هر پرونده است: کد ملی تازه پرونده‌ی تازه می‌سازد و کد ملی موجود همان پرونده را با ستون‌های نگاشت‌شده به‌روز می‌کند (خانه‌ی خالی یعنی پاک کردن آن مقدار). پیش از ثبت، پیش‌نمایش خطای هر ردیف را نشان می‌دهد و فقط ردیف‌های درست ثبت می‌شوند."
        breadcrumbs={[{ label: "پرونده‌های پرسنلی", to: "/hr/employees" }]}
        actions={
          <Button asChild variant="outline">
            <a href="/api/hr/employees/import/template/" download>
              <Download /> فایل نمونه
            </a>
          </Button>
        }
      />
      <Section title="فایل" description="فایل اکسل (xlsx) یا CSV با یک ردیف سرستون؛ حداکثر ۲۰۰۰ ردیف. فایل نمونه سرستون‌ها و برگه‌ی راهنمای مقدارهای مجاز را دارد.">
        <FilePicker id="import-file" value={file} onChange={choose} accept=".xlsx,.csv" label="انتخاب فایل اکسل" />
      </Section>
      {inspect && (
        <Section
          title="نگاشت ستون‌ها"
          description="برای هر ستون فایل، فیلد پرونده را انتخاب کنید؛ ستون‌هایی که عنوانشان با عنوان فیلد یکی است خودکار نگاشت شده‌اند. ستون «کد ملی» لازم است."
          meta={`${toFaDigits(inspect.row_count)} ردیف`}
          actions={
            <Button onClick={() => run.mutate(false)} disabled={run.isPending}>
              <Eye /> پیش‌نمایش
            </Button>
          }
        >
          <FormGrid columns={3}>
            {inspect.headers.map((header, i) => (
              <Field key={`${header}-${i}`}>
                <FieldLabel htmlFor={`map-${i}`}>{header}</FieldLabel>
                <Select value={mapping[header] ?? IGNORE} onValueChange={(v) => setColumn(header, v)}>
                  <SelectTrigger id={`map-${i}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={IGNORE}>نادیده گرفته شود</SelectItem>
                    {inspect.columns.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </FormGrid>
        </Section>
      )}
      {result && <Preview result={result} valid={valid} onCommit={() => run.mutate(true)} busy={run.isPending} />}
    </>
  )
}

const col = columnHelper<Row>()

function Preview({ result, valid, onCommit, busy }: { result: Result; valid: number; onCommit: () => void; busy: boolean }) {
  const columns = React.useMemo<DataTableColumn<Row>[]>(
    () => [
      col.accessor("row", { header: "ردیف", meta: { label: "ردیف" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span> }),
      col.accessor("name", { header: "نام", meta: { label: "نام", primary: true }, cell: (c) => c.getValue() || "—" }),
      col.accessor("national_code", { header: "کد ملی", meta: { label: "کد ملی" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue()) || "—"}</span> }),
      col.accessor("action", {
        header: "نتیجه",
        meta: { label: "نتیجه", filterOptions: Object.entries(ACTIONS).map(([value, a]) => ({ value, label: a.label })), exportValue: (r) => ACTIONS[r.action].label },
        cell: (c) => <StatusBadge tone={ACTIONS[c.row.original.action].tone}>{ACTIONS[c.row.original.action].label}</StatusBadge>,
      }),
      col.accessor(
        (r) =>
          Object.entries(r.errors ?? {})
            .map(([k, v]) => `${k}: ${v}`)
            .join("؛ "),
        {
          id: "errors",
          header: "خطاها",
          enableSorting: false,
          meta: { label: "خطاها", wrap: true },
          cell: (c) => <span className="text-destructive">{c.getValue()}</span>,
        }
      ),
    ],
    []
  )
  const view = useTableView("hr-import-preview", { defaultSort: "row" })
  const table = useDataTable({ view, columns, data: result.rows, getRowId: (r) => String(r.row) })
  const { create, update, error } = result.counts
  return (
    <Section
      title="پیش‌نمایش"
      meta={`${toFaDigits(create)} تازه، ${toFaDigits(update)} به‌روزرسانی، ${toFaDigits(error)} خطا`}
      actions={
        <Button onClick={onCommit} disabled={busy || valid === 0}>
          <Upload /> ثبت {toFaDigits(valid)} ردیف درست
        </Button>
      }
    >
      <DataTable table={table} view={view} caption="پیش‌نمایش ورود" compact exportFileName="پیش‌نمایش ورود پرونده‌ها" empty={{ title: "ردیفی در فایل نیست" }} />
    </Section>
  )
}
