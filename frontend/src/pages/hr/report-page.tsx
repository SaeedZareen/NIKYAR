import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { useQuery } from "@tanstack/react-query"
import { startOfYear } from "date-fns-jalali"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { JalaliDateInput } from "@/components/form/inputs"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { RankChart, StatTiles } from "@/components/report"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDate, formatNumber, parseJalali, toFaDigits, toJalaliString } from "@/lib/format"

type Report = Schemas["HrReport"]
type Count = Schemas["HrReportCount"]
type Movement = Schemas["HrReportMovement"]
type Doc = Schemas["HrReportDocument"]
type Filters = { start: string; end: string }
type Dimension = keyof Report["breakdowns"]

const DIMENSIONS: { key: Dimension; tab: string; title: string }[] = [
  { key: "unit", tab: "واحد", title: "کارکنان شاغل به تفکیک واحد" },
  { key: "employment_type", tab: "نوع استخدام", title: "کارکنان شاغل به تفکیک نوع استخدام" },
  { key: "education", tab: "مقطع تحصیلی", title: "کارکنان شاغل به تفکیک بالاترین مقطع تحصیلی" },
  { key: "gender", tab: "جنسیت", title: "کارکنان شاغل به تفکیک جنسیت" },
  { key: "age", tab: "گروه سنی", title: "کارکنان شاغل به تفکیک گروه سنی" },
]
const KINDS: Record<Movement["kind"], { label: string; tone: "success" | "neutral" }> = {
  join: { label: "ورود", tone: "success" },
  leave: { label: "خروج", tone: "neutral" },
}

const validDate = (value: string) => (/^\d{4}\/\d{2}\/\d{2}$/.test(value) && parseJalali(value) ? value : undefined)
const employeeHref = (r: { employee: number }) => `/hr/employees/${r.employee}`

/** بازه‌ی پیش‌فرض: آغاز سال شمسی جاری تا امروز. */
function thisYear(): Filters {
  const today = new Date()
  return { start: toJalaliString(startOfYear(today)), end: toJalaliString(today) }
}

/** «گزارش نیروی انسانی»: ترکیب کارکنان شاغل، ورود و خروج در بازه و مدارک رو به پایان اعتبار؛ در دامنه‌ی دید کاربر. */
export default function HrReportPage() {
  const form = useForm<Filters>({ defaultValues: thisYear() })
  const values = useWatch({ control: form.control })
  const start = validDate(values.start ?? "")
  const end = validDate(values.end ?? "")
  const report = useQuery({
    queryKey: ["hr", "report", start, end],
    queryFn: () => unwrap(api.GET("/api/hr/report/", { params: { query: { start: start as string, end: end as string } } })),
    enabled: !!start && !!end,
    placeholderData: (previous) => previous,
  })
  const data = report.data
  const tiles = data && [
    { label: "کارکنان شاغل", value: formatNumber(data.summary.active) },
    { label: "ورود در بازه", value: formatNumber(data.summary.joins), meta: "بر پایه‌ی تاریخ استخدام" },
    { label: "خروج در بازه", value: formatNumber(data.summary.leaves), meta: "بر پایه‌ی تاریخ پایان همکاری" },
    { label: "مدارک رو به پایان اعتبار", value: formatNumber(data.summary.expiring), meta: "گذشته یا نزدیک به تاریخ اعتبار" },
  ]

  return (
    <>
      <PageHeader
        title="گزارش نیروی انسانی"
        description="پرونده‌هایی که می‌بینید (مدیر واحد: کارکنان واحد خودش). ترکیب کارکنان و مدارک برای شاغلان امروز است و بازه فقط ورود و خروج را محدود می‌کند. مهلت هشدار مدارک در «تنظیمات › منابع انسانی: دوران خدمت» است."
      />
      <div className="flex flex-col gap-4">
        <Section title="بازه‌ی ورود و خروج">
          <FormGrid>
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
            <Section title="خلاصه">
              <StatTiles tiles={tiles} />
            </Section>
            <Details data={data} loading={report.isPending} />
          </>
        )}
      </div>
    </>
  )
}

function Details({ data, loading }: { data?: Report; loading: boolean }) {
  return (
    <Tabs defaultValue="unit" className="gap-4">
      <TabsList>
        {DIMENSIONS.map((d) => (
          <TabsTrigger key={d.key} value={d.key}>
            {d.tab}
          </TabsTrigger>
        ))}
        <TabsTrigger value="movements">ورود و خروج</TabsTrigger>
        <TabsTrigger value="documents">مدارک</TabsTrigger>
      </TabsList>
      {DIMENSIONS.map((d) => (
        <TabsContent key={d.key} value={d.key} className="flex flex-col gap-4">
          <RankChart title={d.title} rows={(data?.breakdowns[d.key] ?? []).map((r) => ({ name: r.title, value: r.count }))} label="شمار کارکنان" integer empty="کارمند شاغلی نیست." />
          <CountTable name={d.key} title={d.title} tab={d.tab} rows={data?.breakdowns[d.key] ?? []} loading={loading} />
        </TabsContent>
      ))}
      <TabsContent value="movements" className="flex flex-col gap-4">
        <MonthsChart months={data?.months ?? []} />
        <MovementsTable rows={data?.movements ?? []} loading={loading} />
      </TabsContent>
      <TabsContent value="documents">
        <DocumentsTable rows={data?.documents ?? []} loading={loading} />
      </TabsContent>
    </Tabs>
  )
}

const countCol = columnHelper<Count>()
function CountTable({ name, title, tab, rows, loading }: { name: string; title: string; tab: string; rows: Count[]; loading: boolean }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0)
  const columns = React.useMemo<DataTableColumn<Count>[]>(
    () => [
      countCol.accessor("title", { header: tab, meta: { label: tab, primary: true } }),
      countCol.accessor("count", { header: "شمار", meta: { label: "شمار" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
      countCol.accessor((r) => (total ? Math.round((r.count / total) * 1000) / 10 : 0), {
        id: "percent",
        header: "سهم",
        meta: { label: "سهم" },
        cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}٪</span>,
      }),
    ],
    [tab, total]
  )
  const view = useTableView(`hr-report-${name}`)
  const table = useDataTable({ view, columns, data: rows, getRowId: (r) => r.key })
  return <DataTable table={table} view={view} caption={title} loading={loading} compact exportFileName={title} empty={{ title: "کارمند شاغلی نیست" }} />
}

/** ورود و خروج هر ماه شمسی بازه: دو سری کنار هم با راهنمای رنگ. */
function MonthsChart({ months }: { months: Report["months"] }) {
  const config = { joins: { label: "ورود", color: "var(--chart-1)" }, leaves: { label: "خروج", color: "var(--chart-3)" } } satisfies ChartConfig
  const title = "ورود و خروج هر ماه"
  const any = months.some((m) => m.joins || m.leaves)
  return (
    <Section title={title}>
      {any ? (
        <ChartContainer
          config={config}
          className="h-64 w-full"
          role="img"
          aria-label={`${title}: ${months.map((m) => `${m.label} ورود ${formatNumber(m.joins)} خروج ${formatNumber(m.leaves)}`).join("، ")}`}
        >
          <BarChart data={months} margin={{ left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" reversed tickLine={false} axisLine={false} fontSize={11} />
            <YAxis orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={32} fontSize={11} tickFormatter={(v: number) => formatNumber(v)} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="joins" fill="var(--color-joins)" radius={4} />
            <Bar dataKey="leaves" fill="var(--color-leaves)" radius={4} />
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="text-xs text-muted-foreground">در این بازه ورود یا خروجی ثبت نشده است.</p>
      )}
    </Section>
  )
}

const moveCol = columnHelper<Movement>()
function MovementsTable({ rows, loading }: { rows: Movement[]; loading: boolean }) {
  const columns = React.useMemo<DataTableColumn<Movement>[]>(
    () => [
      moveCol.accessor("name", { header: "نام", meta: { label: "نام", primary: true } }),
      moveCol.accessor("personnel_code", { header: "کد پرسنلی", meta: { label: "کد پرسنلی" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span> }),
      moveCol.accessor("unit", { header: "واحد", meta: { label: "واحد" }, cell: (c) => c.getValue() || "—" }),
      moveCol.accessor("kind", {
        header: "رویداد",
        meta: { label: "رویداد", filterOptions: Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label })), exportValue: (r) => KINDS[r.kind].label },
        cell: (c) => <StatusBadge tone={KINDS[c.row.original.kind].tone}>{KINDS[c.row.original.kind].label}</StatusBadge>,
      }),
      moveCol.accessor("date", { header: "تاریخ", meta: { label: "تاریخ" }, cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span> }),
      moveCol.accessor("reason", { header: "علت خروج", meta: { label: "علت خروج" }, cell: (c) => c.getValue() || "—" }),
    ],
    []
  )
  const view = useTableView("hr-report-movements", { defaultSort: "-date" })
  const table = useDataTable({ view, columns, data: rows, getRowId: (r) => r.id })
  return (
    <DataTable
      table={table}
      view={view}
      caption="ورود و خروج کارکنان"
      loading={loading}
      rowHref={employeeHref}
      exportFileName="ورود و خروج کارکنان"
      empty={{ title: "در این بازه ورود یا خروجی نیست" }}
    />
  )
}

const docCol = columnHelper<Doc>()
function DocumentsTable({ rows, loading }: { rows: Doc[]; loading: boolean }) {
  const columns = React.useMemo<DataTableColumn<Doc>[]>(
    () => [
      docCol.accessor("name", { header: "کارمند", meta: { label: "کارمند", primary: true } }),
      docCol.accessor("kind", { header: "نوع مدرک", meta: { label: "نوع مدرک" } }),
      docCol.accessor("number", { header: "شماره", meta: { label: "شماره" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue()) || "—"}</span> }),
      docCol.accessor("expiry_date", { header: "تاریخ اعتبار", meta: { label: "تاریخ اعتبار" }, cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span> }),
      docCol.accessor("days_left", {
        header: "وضعیت",
        meta: { label: "وضعیت", exportValue: (r) => remaining(r.days_left) },
        cell: (c) => <StatusBadge tone={c.getValue() < 0 ? "destructive" : "warning"}>{remaining(c.getValue())}</StatusBadge>,
      }),
    ],
    []
  )
  const view = useTableView("hr-report-documents", { defaultSort: "days_left" })
  const table = useDataTable({ view, columns, data: rows, getRowId: (r) => String(r.id) })
  return (
    <DataTable
      table={table}
      view={view}
      caption="مدارک رو به پایان اعتبار"
      loading={loading}
      rowHref={employeeHref}
      exportFileName="مدارک رو به پایان اعتبار"
      empty={{ title: "مدرکی رو به پایان اعتبار نیست" }}
    />
  )
}

function remaining(days: number) {
  if (days < 0) return `${formatNumber(-days)} روز گذشته`
  return days === 0 ? "امروز پایان می‌یابد" : `${formatNumber(days)} روز مانده`
}
