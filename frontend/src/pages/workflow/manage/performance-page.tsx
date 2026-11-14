import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { useQuery } from "@tanstack/react-query"
import { subDays } from "date-fns-jalali"
import type { RowData } from "@tanstack/react-table"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { JalaliDateInput } from "@/components/form/inputs"
import { PageHeader } from "@/components/layout/page-header"
import { RankChart, StatTiles } from "@/components/report"
import { Section } from "@/components/layout/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber, parseJalali, toFaDigits, toJalaliString } from "@/lib/format"

type Report = Schemas["PerformanceReport"]
type Step = Schemas["PerformanceStep"]
type Person = Schemas["PerformancePerson"]
type Unit = Schemas["PerformanceUnit"]
type Process = Schemas["PerformanceProcess"]
type Filters = { process: string; start: string; end: string }

const ALL = "all"
const CHART_ROWS = 8

const hours = (value: number | null | undefined) => (value == null ? "—" : `${formatNumber(value)} ساعت`)
const percent = (value: number | null | undefined) => (value == null ? "—" : `${toFaDigits(value)}٪`)
/** تاریخ کامل و معتبر (تا پیش از کامل شدن تایپ، گزارش با مقدار قبلی می‌ماند). */
const validDate = (value: string) => (/^\d{4}\/\d{2}\/\d{2}$/.test(value) && parseJalali(value) ? value : undefined)

/** بازه‌ی پیش‌فرض: ۹۰ روز اخیر تا امروز. */
function lastNinetyDays(): Filters {
  const today = new Date()
  return { process: ALL, start: toJalaliString(subDays(today, 89)), end: toJalaliString(today) }
}

/** گزارش عملکرد گردش کار برای مدیران: خلاصه، گلوگاه‌ها، فرایندها، افراد و واحدها در بازه‌ی دلخواه. */
export default function PerformancePage() {
  const form = useForm<Filters>({ defaultValues: lastNinetyDays() })
  const values = useWatch({ control: form.control })
  const start = validDate(values.start ?? "")
  const end = validDate(values.end ?? "")
  const process = values.process && values.process !== ALL ? Number(values.process) : undefined
  const report = useQuery({
    queryKey: ["workflow", "performance", process, start, end],
    queryFn: () => unwrap(api.GET("/api/workflow/performance/", { params: { query: { process, start, end } } })),
    placeholderData: (previous) => previous,
  })
  const data = report.data

  return (
    <>
      <PageHeader
        title="گزارش عملکرد"
        description="درخواست‌هایی که در بازه ارسال شده‌اند، از فرایندهایی که مدیرشان هستید. زمان‌ها به ساعت کاری است (روزها و ساعت کاری و تعطیلات تنظیمات)، همان مبنای مهلت مرحله‌ها؛ زمان مرحله از رسیدن کار تا انجام آن است."
      />
      <div className="flex flex-col gap-4">
        <Section title="بازه و فرایند">
          <FormGrid>
            <FormField
              control={form.control}
              name="process"
              label="فرایند"
              render={({ field, id, aria }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={id} className="w-full" {...aria}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>همه‌ی فرایندها</SelectItem>
                    {data?.process_options.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormField
              control={form.control}
              name="start"
              label="از تاریخ"
              render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
            />
            <FormField
              control={form.control}
              name="end"
              label="تا تاریخ"
              description="روز پایان هم جزو بازه است."
              render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
            />
          </FormGrid>
        </Section>
        {report.error ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(report.error)}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Summary summary={data?.summary} />
            <Details data={data} loading={report.isPending} />
          </>
        )}
      </div>
    </>
  )
}

function Summary({ summary }: { summary?: Report["summary"] }) {
  const tiles = summary && [
    { label: "درخواست‌ها", value: formatNumber(summary.requests), meta: `${formatNumber(summary.running)} در جریان` },
    { label: "پایان‌یافته", value: formatNumber(summary.completed + summary.rejected), meta: `${formatNumber(summary.rejected)} رد شده · ${formatNumber(summary.cancelled)} لغو` },
    { label: "میانگین زمان درخواست", value: hours(summary.avg_hours), meta: `بیشترین: ${hours(summary.max_hours)}` },
    { label: "کارهای دیرکرده", value: formatNumber(summary.late), meta: summary.late_percent == null ? "کاری مهلت ندارد" : `${percent(summary.late_percent)} کارهای مهلت‌دار` },
  ]
  return (
    <Section title="خلاصه">
      <StatTiles tiles={tiles} />
    </Section>
  )
}

function Details({ data, loading }: { data?: Report; loading: boolean }) {
  const steps = data?.steps ?? []
  const people = data?.people ?? []
  return (
    <Tabs defaultValue="steps" className="gap-4">
      <TabsList>
        <TabsTrigger value="steps">مرحله‌ها و گلوگاه‌ها</TabsTrigger>
        <TabsTrigger value="processes">فرایندها</TabsTrigger>
        <TabsTrigger value="people">افراد</TabsTrigger>
        <TabsTrigger value="units">واحدها</TabsTrigger>
      </TabsList>
      <TabsContent value="steps" className="flex flex-col gap-4">
        <RankChart
          title="کندترین مرحله‌ها"
          description="میانگین زمان انجام هر مرحله به ساعت کاری؛ مرحله‌های بالای نمودار گلوگاه‌اند."
          rows={steps.filter((s) => s.avg_hours != null).slice(0, CHART_ROWS).map((s) => ({ name: s.title, value: s.avg_hours ?? 0 }))}
          label="میانگین زمان (ساعت)"
          empty="هنوز مرحله‌ای انجام نشده است."
        />
        <StepsTable rows={steps} loading={loading} />
      </TabsContent>
      <TabsContent value="processes">
        <ProcessesTable rows={data?.processes ?? []} loading={loading} />
      </TabsContent>
      <TabsContent value="people" className="flex flex-col gap-4">
        <RankChart
          title="کارهای منتظر هر نفر"
          description="بار کاری فعلی: کارهای منتظری که به هر نفر رسیده است (کار گروهی برای همه‌ی گیرنده‌ها شمرده می‌شود)."
          rows={people.filter((p) => p.open > 0).sort((a, b) => b.open - a.open).slice(0, CHART_ROWS).map((p) => ({ name: p.name, value: p.open }))}
          label="کار منتظر"
          integer
          empty="کار منتظری نیست."
        />
        <PeopleTable rows={people} loading={loading} />
      </TabsContent>
      <TabsContent value="units">
        <UnitsTable rows={data?.units ?? []} loading={loading} />
      </TabsContent>
    </Tabs>
  )
}

function useReportTable<T extends RowData>(name: string, rows: T[], columns: DataTableColumn<T>[], getRowId: (row: T) => string, defaultSort?: string) {
  const view = useTableView(`performance-${name}`, defaultSort ? { defaultSort } : {})
  const table = useDataTable({ view, columns, data: rows, getRowId })
  return { view, table }
}

const stepCol = columnHelper<Step>()
function StepsTable({ rows, loading }: { rows: Step[]; loading: boolean }) {
  const columns = React.useMemo<DataTableColumn<Step>[]>(
    () => [
      stepCol.accessor("title", { header: "مرحله", meta: { label: "مرحله", primary: true } }),
      stepCol.accessor("process", { header: "فرایند", meta: { label: "فرایند" } }),
      ...statColumns<Step>(),
    ],
    []
  )
  const { view, table } = useReportTable("steps", rows, columns, (r) => r.key)
  return <DataTable table={table} view={view} caption="زمان مرحله‌ها" loading={loading} exportFileName="زمان مرحله‌ها" empty={{ title: "در این بازه کاری نرسیده است" }} />
}

const processCol = columnHelper<Process>()
function ProcessesTable({ rows, loading }: { rows: Process[]; loading: boolean }) {
  const columns = React.useMemo<DataTableColumn<Process>[]>(
    () => [
      processCol.accessor("title", { header: "فرایند", meta: { label: "فرایند", primary: true } }),
      processCol.accessor("requests", { header: "درخواست‌ها", meta: { label: "درخواست‌ها" }, cell: (c) => <Num value={c.getValue()} /> }),
      processCol.accessor("running", { header: "در جریان", meta: { label: "در جریان" }, cell: (c) => <Num value={c.getValue()} /> }),
      processCol.accessor("avg_hours", { header: "میانگین زمان", meta: { label: "میانگین زمان" }, cell: (c) => <Hours value={c.getValue()} /> }),
      processCol.accessor("max_hours", { header: "بیشترین زمان", meta: { label: "بیشترین زمان" }, cell: (c) => <Hours value={c.getValue()} /> }),
      processCol.accessor("late_percent", { header: "دیرکرد", meta: { label: "دیرکرد" }, cell: (c) => <span className="tabular-nums">{percent(c.getValue())}</span> }),
    ],
    []
  )
  const { view, table } = useReportTable("processes", rows, columns, (r) => String(r.id))
  return <DataTable table={table} view={view} caption="زمان فرایندها" loading={loading} exportFileName="زمان فرایندها" empty={{ title: "در این بازه درخواستی ارسال نشده است" }} />
}

const personCol = columnHelper<Person>()
function PeopleTable({ rows, loading }: { rows: Person[]; loading: boolean }) {
  const columns = React.useMemo<DataTableColumn<Person>[]>(
    () => [
      personCol.accessor("name", { header: "نام", meta: { label: "نام", primary: true } }),
      personCol.accessor("unit", { header: "واحد", meta: { label: "واحد" }, cell: (c) => c.getValue() || "—" }),
      ...statColumns<Person>(),
    ],
    []
  )
  const { view, table } = useReportTable("people", rows, columns, (r) => String(r.id))
  return <DataTable table={table} view={view} caption="بار کاری افراد" loading={loading} exportFileName="بار کاری افراد" empty={{ title: "در این بازه کاری به کسی نرسیده است" }} />
}

const unitCol = columnHelper<Unit>()
function UnitsTable({ rows, loading }: { rows: Unit[]; loading: boolean }) {
  const columns = React.useMemo<DataTableColumn<Unit>[]>(() => [unitCol.accessor("name", { header: "واحد", meta: { label: "واحد", primary: true } }), ...statColumns<Unit>()], [])
  const { view, table } = useReportTable("units", rows, columns, (r) => String(r.id ?? "none"))
  return <DataTable table={table} view={view} caption="بار کاری واحدها" loading={loading} exportFileName="بار کاری واحدها" empty={{ title: "در این بازه کاری به واحدی نرسیده است" }} />
}

type Stats = Pick<Step, "done" | "open" | "avg_hours" | "max_hours" | "late" | "late_percent">

/** ستون‌های مشترک مرحله، فرد و واحد. */
function statColumns<T extends Stats & RowData>(): DataTableColumn<T>[] {
  const c = columnHelper<T>()
  return [
    c.accessor((r) => r.done, { id: "done", header: "انجام‌شده", meta: { label: "انجام‌شده" }, cell: (x) => <Num value={x.getValue()} /> }),
    c.accessor((r) => r.open, { id: "open", header: "منتظر", meta: { label: "منتظر" }, cell: (x) => <Num value={x.getValue()} /> }),
    c.accessor((r) => r.avg_hours, { id: "avg_hours", header: "میانگین زمان", meta: { label: "میانگین زمان" }, cell: (x) => <Hours value={x.getValue()} /> }),
    c.accessor((r) => r.max_hours, { id: "max_hours", header: "بیشترین زمان", meta: { label: "بیشترین زمان" }, cell: (x) => <Hours value={x.getValue()} /> }),
    c.accessor((r) => r.late, { id: "late", header: "دیرکرده", meta: { label: "دیرکرده" }, cell: (x) => <Num value={x.getValue()} /> }),
    c.accessor((r) => r.late_percent, { id: "late_percent", header: "درصد دیرکرد", meta: { label: "درصد دیرکرد" }, cell: (x) => <span className="tabular-nums">{percent(x.getValue())}</span> }),
  ] as DataTableColumn<T>[]
}

const Num = ({ value }: { value: number }) => <span className="tabular-nums">{formatNumber(value)}</span>
const Hours = ({ value }: { value: number | null | undefined }) => <span className="tabular-nums">{hours(value)}</span>
