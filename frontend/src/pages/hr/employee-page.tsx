import * as React from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Pencil, UserRound } from "lucide-react"
import { PageError, PageFallback } from "@/app/route-states"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { DescriptionList } from "@/components/description-list"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDate, toFaDigits } from "@/lib/format"
import { fileUrl } from "@/lib/files"
import { EmployeeSheet } from "./employee-sheet"
import { BANK, DEPENDENTS, DOCUMENTS, EDUCATION, INSURANCE, WORK } from "./record-kinds"
import { RecordSection } from "./record-section"
import { EMPLOYEES_KEY, STATUS_TONES, useCustomFields } from "./employees"
import { EventsSection } from "./events-section"
import { ExtraInfo } from "./extra-info"

type Employee = Schemas["EmployeeDetail"]
type Position = Schemas["EmployeePosition"]
const TABS = [
  { value: "profile", label: "مشخصات" },
  { value: "employment", label: "استخدام" },
  { value: "events", label: "درخواست‌ها و رویدادها" },
  { value: "extra", label: "اطلاعات تکمیلی" },
  { value: "history", label: "تحصیلات و سوابق کاری" },
  { value: "family", label: "خانواده" },
  { value: "financial", label: "بانک و بیمه", financial: true },
  { value: "documents", label: "مدارک" },
] as const

/** صفحه‌ی پرونده‌ی پرسنلی با زبانه‌ها؛ ویرایش فقط برای `hr.manage` (مدیر واحد فقط می‌بیند). */
export default function EmployeePage() {
  const { employeeId = "" } = useParams()
  const employee = useQuery({ queryKey: [...EMPLOYEES_KEY, employeeId], queryFn: () => unwrap(api.GET("/api/hr/employees/{id}/", { params: { path: { id: Number(employeeId) } } })) })
  if (employee.isPending) return <PageFallback />
  if (employee.error) return <PageError error={employee.error} onRetry={() => employee.refetch()} />
  return <EmployeeView data={employee.data} />
}

/** پرونده با زبانه‌ها؛ با own («پرونده‌ی من») بی مسیر بازگشت به فهرست و همیشه فقط‌خواندنی. */
export function EmployeeView({ data, own = false }: { data: Employee; own?: boolean }) {
  const custom = useCustomFields().data
  const [params, setParams] = useSearchParams()
  // حساب بانکی و بیمه برای مدیر واحد (بی مجوز پرونده‌ها) دیده نمی‌شود
  const tabs = TABS.filter((t) => !("financial" in t) || data.can_view_financial)
  const tab = tabs.some((t) => t.value === params.get("tab")) ? (params.get("tab") as string) : "profile"
  const [editing, setEditing] = React.useState(false)
  const digits = (value: string) => (value ? <span className="tabular-nums">{toFaDigits(value)}</span> : undefined)
  const text = (value: string) => value || undefined

  return (
    <>
      <PageHeader
        title={data.full_name}
        breadcrumbs={own ? undefined : [{ label: "پرونده‌های پرسنلی", to: "/hr/employees" }]}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="tabular-nums">کد پرسنلی {toFaDigits(data.personnel_code)}</span>
            <StatusBadge tone={STATUS_TONES[data.status]}>{data.status_label}</StatusBadge>
          </span>
        }
        actions={
          data.can_edit && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> ویرایش پرونده
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(t) => setParams(t === "profile" ? {} : { tab: t }, { replace: true })} className="gap-4">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile" className="flex flex-col gap-4">
          <Section title="مشخصات فردی">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {data.photo ? (
                <img src={`${fileUrl(data.photo)}?inline=1`} alt={`عکس پرسنلی ${data.full_name}`} className="size-28 shrink-0 rounded-lg border object-cover" />
              ) : (
                <div className="flex size-28 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground" aria-hidden>
                  <UserRound className="size-10" />
                </div>
              )}
              <DescriptionList
                className="flex-1"
                items={[
                  { label: "نام", value: data.first_name },
                  { label: "نام خانوادگی", value: data.last_name },
                  { label: "نام پدر", value: text(data.father_name) },
                  { label: "کد ملی", value: digits(data.national_code) },
                  { label: "شماره‌ی شناسنامه", value: digits(data.id_number) },
                  { label: "تاریخ تولد", value: data.birth_date ? <span className="tabular-nums">{formatDate(data.birth_date)}</span> : undefined },
                  { label: "محل تولد", value: text(data.birth_place) },
                  { label: "جنسیت", value: data.gender_label },
                  { label: "وضعیت تأهل", value: text(data.marital_status_label) },
                ]}
              />
            </div>
          </Section>
          <Section title="تماس و نشانی">
            <DescriptionList
              items={[
                { label: "موبایل", value: digits(data.mobile) },
                { label: "ایمیل", value: text(data.email), ltr: true },
                { label: "استان و شهر", value: data.province ? [data.province, data.city].filter(Boolean).join("، ") : undefined },
                { label: "نشانی", value: text(data.address), span: "full" },
              ]}
            />
          </Section>
        </TabsContent>
        <TabsContent value="employment" className="flex flex-col gap-4">
          <Section title="استخدام">
            <DescriptionList
              items={[
                { label: "تاریخ استخدام", value: <span className="tabular-nums">{formatDate(data.hire_date)}</span> },
                { label: "نوع استخدام", value: data.employment_type_title },
                { label: "واحد", value: text(data.unit_name) },
                { label: "کاربر سامانه", value: text(data.user_name) },
                { label: "وضعیت", value: <StatusBadge tone={STATUS_TONES[data.status]}>{data.status_label}</StatusBadge> },
                ...(data.status === "separated"
                  ? [
                      { label: "تاریخ پایان همکاری", value: data.separation_date ? <span className="tabular-nums">{formatDate(data.separation_date)}</span> : undefined },
                      { label: "علت پایان همکاری", value: text(data.separation_reason_title) },
                    ]
                  : []),
              ]}
            />
          </Section>
          <Positions data={data} />
        </TabsContent>
        <TabsContent value="events">
          <EventsSection employee={data} />
        </TabsContent>
        <TabsContent value="extra">{custom ? <ExtraInfo employee={data} custom={custom} /> : <Skeleton className="h-40 w-full" />}</TabsContent>
        <TabsContent value="history" className="flex flex-col gap-4">
          <RecordSection config={EDUCATION} employee={data} />
          <RecordSection config={WORK} employee={data} />
        </TabsContent>
        <TabsContent value="family">
          <RecordSection config={DEPENDENTS} employee={data} />
        </TabsContent>
        {data.can_view_financial && (
          <TabsContent value="financial" className="flex flex-col gap-4">
            <RecordSection config={BANK} employee={data} />
            <RecordSection config={INSURANCE} employee={data} />
          </TabsContent>
        )}
        <TabsContent value="documents">
          <RecordSection config={DOCUMENTS} employee={data} />
        </TabsContent>
      </Tabs>
      {editing && <EmployeeSheet employee={data} open onOpenChange={setEditing} />}
    </>
  )
}

const col = columnHelper<Position>()

function Positions({ data }: { data: Employee }) {
  const columns = React.useMemo<DataTableColumn<Position>[]>(
    () => [
      col.accessor("title", {
        header: "سمت",
        meta: { label: "سمت", primary: true },
        cell: (c) => (
          <span className="inline-flex flex-wrap items-center gap-1">
            {c.getValue()}
            {c.row.original.is_manager && <StatusBadge tone="info">مدیر واحد</StatusBadge>}
            {c.row.original.is_primary && <StatusBadge tone="neutral">سمت اصلی</StatusBadge>}
          </span>
        ),
      }),
      col.accessor("unit", { header: "واحد", meta: { label: "واحد" } }),
      col.accessor("start_date", { header: "از تاریخ", meta: { label: "از تاریخ" }, cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span> }),
    ],
    []
  )
  const view = useTableView("hr-employee-positions")
  const table = useDataTable({ view, columns, data: data.positions, getRowId: (p) => `${p.title}-${p.unit}` })
  return (
    <Section title="سمت‌های جاری" description="از انتصاب‌های کاربر متصل در «ساختار سازمانی» خوانده می‌شود؛ برای تغییر سمت، انتصاب را در ساختار سازمانی ویرایش کنید.">
      {data.user ? (
        <DataTable table={table} view={view} caption="سمت‌های جاری" compact empty={{ title: "کاربر متصل امروز سمتی ندارد" }} />
      ) : (
        <p className="text-xs text-muted-foreground">این پرونده به کاربر سامانه وصل نیست؛ سمت‌ها برای کاربران متصل نمایش داده می‌شوند.</p>
      )}
    </Section>
  )
}
