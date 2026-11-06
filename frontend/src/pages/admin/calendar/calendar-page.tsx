import * as React from "react"
import { Link, useSearchParams } from "react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getMonth, getYear } from "date-fns-jalali"
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/app/auth"
import { useIsMobile } from "@/hooks/use-mobile"
import { CALENDAR_KEY, WEEKDAYS, useWorkCalendar, type Holiday } from "@/app/work-calendar"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { JalaliCalendar } from "@/components/jalali-calendar"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { formatDate, formatNumber, toFaDigits, toJalaliString } from "@/lib/format"
import { HolidaySheet } from "./holiday-sheet"
import { ImportHolidays } from "./import-holidays"

const EMPTY: Holiday[] = []
const col = columnHelper<Holiday>()
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
/** ماه‌های ثابت: بدون دکمه‌ی ماه قبل/بعد و بدون انتخاب سال؛ عنوان فقط نام ماه. */
const FIXED_MONTH = {
  NavButton: () => null,
  Caption: ({ monthLabel }: { monthLabel: string }) => <p className="py-1 text-center text-xs font-semibold">{monthLabel}</p>,
}

export default function CalendarPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [thisYear] = React.useState(() => getYear(new Date()))
  const year = Number(params.get("year")) || thisYear
  const calendar = useWorkCalendar()
  const holidays = React.useMemo(() => (calendar.data?.holidays ?? EMPTY).filter((h) => h.date.startsWith(`${year}/`)), [calendar.data, year])
  const offDays = WEEKDAYS.filter((_, d) => calendar.data && !calendar.data.work_week.some((w) => w.day === d))
  const officialLoaded = calendar.data?.official_years.includes(year)
  const isMobile = useIsMobile()

  const [sheet, setSheet] = React.useState<{ holiday: Holiday | null; date?: string } | null>(null)
  const [deleting, setDeleting] = React.useState<Holiday | null>(null)
  const remove = useMutation({
    mutationFn: (h: Holiday) => unwrap(api.DELETE("/api/calendar/holidays/{id}/", { params: { path: { id: h.id } } })),
    onSuccess: (_, h) => {
      qc.invalidateQueries({ queryKey: CALENDAR_KEY })
      setSheet(null)
      toast.success(`«${h.title}» از تعطیلات حذف شد.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const loadOfficial = useMutation({
    mutationFn: () => unwrap(api.POST("/api/calendar/holidays/load-official/", { body: { year } })),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: CALENDAR_KEY })
      if (r.complete) toast.success(`${formatNumber(r.created)} روز تعطیل رسمی سال ${toFaDigits(year)} اضافه شد.`)
      else
        toast.warning(
          `${formatNumber(r.created)} تعطیلی ثابت شمسی اضافه شد. تقویم رسمی سال ${toFaDigits(year)} هنوز منتشر نشده؛ تعطیلات قمری را پس از انتشار، دستی یا از فایل اضافه کنید.`
        )
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onDayClick = (date: Date | null) => {
    if (!date) return
    const value = toJalaliString(date)
    const existing = calendar.data?.holidays.find((h) => h.date === value)
    setSheet(existing ? { holiday: existing } : { holiday: null, date: value })
  }

  const columns = React.useMemo<DataTableColumn<Holiday>[]>(
    () => [
      col.accessor("date", {
        header: "تاریخ",
        meta: { label: "تاریخ" },
        cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span>,
      }),
      col.accessor((h) => formatDate(h.date, "weekday"), { id: "weekday", header: "روز", enableSorting: false, meta: { label: "روز" } }),
      col.accessor("title", { header: "عنوان", meta: { label: "عنوان", primary: true, wrap: true } }),
      col.accessor("kind", {
        header: "نوع",
        enableSorting: false,
        meta: {
          label: "نوع",
          filterOptions: [
            { value: "official", label: "رسمی" },
            { value: "organization", label: "خاص سازمان" },
          ],
          exportValue: (h) => h.kind_label,
        },
        cell: (c) => <StatusBadge tone={c.getValue() === "official" ? "info" : "warning"}>{c.row.original.kind_label}</StatusBadge>,
      }),
      actionsColumn<Holiday>((h) => (
        <>
          <DropdownMenuItem onSelect={() => setSheet({ holiday: h })}>
            <Pencil /> ویرایش
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(h)}>
            <Trash2 /> حذف
          </DropdownMenuItem>
        </>
      )),
    ],
    [setSheet, setDeleting]
  )
  const view = useTableView("holidays", { defaultSort: "date" })
  const table = useDataTable({ view, columns, data: holidays, getRowId: (h) => String(h.id) })
  const goYear = (y: number) => setParams(y === thisYear ? {} : { year: String(y) }, { replace: true })

  return (
    <>
      <PageHeader
        title="تقویم کاری"
        description="تعطیلات رسمی و خاص سازمان؛ مهلت کارها و همه‌ی تقویم‌های سامانه بر همین اساس است. روی هر روز تقویم بزنید تا تعطیل یا عادی شود."
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          <>
            <Button onClick={() => setSheet({ holiday: null })}>
              <Plus /> تعطیلی جدید
            </Button>
            <ImportHolidays />
            {can("settings.manage") && (
              <Button variant="ghost" asChild>
                <Link to="/admin/settings?section=work-week">
                  <Clock /> ساعت کاری
                </Link>
              </Button>
            )}
          </>
        }
      />

      {calendar.data && !officialLoaded && (
        <Alert>
          <CalendarPlus />
          <AlertTitle>تعطیلات رسمی سال {toFaDigits(year)} هنوز ثبت نشده است</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>تعطیلات رسمی کشور را با یک کلیک اضافه کنید؛ پس از آن می‌توانید هر روز را ویرایش کنید.</span>
            <Button size="sm" onClick={() => loadOfficial.mutate()} disabled={loadOfficial.isPending}>
              {loadOfficial.isPending ? <Spinner /> : <CalendarPlus />} افزودن تعطیلات رسمی {toFaDigits(year)}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Section
        title={`تقویم سال ${toFaDigits(year)}`}
        meta={calendar.data && `${formatNumber(holidays.length)} روز تعطیل · روزهای غیرکاری هفته: ${offDays.join("، ") || "ندارد"}`}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="سال قبل" onClick={() => goYear(year - 1)}>
              <ChevronRight />
            </Button>
            <span className="min-w-12 text-center text-xs font-semibold tabular-nums">{toFaDigits(year)}</span>
            <Button variant="ghost" size="icon-sm" aria-label="سال بعد" onClick={() => goYear(year + 1)}>
              <ChevronLeft />
            </Button>
          </div>
        }
      >
        {calendar.data && isMobile ? (
          // روی موبایل یک ماه با جابه‌جایی ماه‌به‌ماه، به‌جای دوازده ماه پشت‌سرهم
          <MobileMonths year={year} onYearChange={goYear} onDayClick={onDayClick} />
        ) : calendar.data ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {MONTHS.map((month) => (
              <JalaliCalendar
                key={`${year}-${month}`}
                value={null}
                onChange={onDayClick}
                visibleMonth={{ year, month, day: 1 }}
                onVisibleMonthChange={() => {}}
                enableSwipeNavigation={false}
                components={FIXED_MONTH}
                className="rounded-lg border"
              />
            ))}
          </div>
        ) : (
          <div role="status" aria-label="در حال بارگذاری" className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {MONTHS.map((m) => (
              <Skeleton key={m} className="h-64" />
            ))}
          </div>
        )}
      </Section>

      <DataTable
        table={table}
        view={view}
        caption={`تعطیلات سال ${toFaDigits(year)}`}
        loading={calendar.isPending}
        error={calendar.error}
        onRetry={() => calendar.refetch()}
        searchPlaceholder="عنوان تعطیلی"
        exportFileName={`تعطیلات ${year}`}
        empty={{ title: `برای سال ${toFaDigits(year)} تعطیلی ثبت نشده است` }}
      />

      {sheet && (
        <HolidaySheet
          key={sheet.holiday?.id ?? sheet.date ?? "new"}
          holiday={sheet.holiday}
          date={sheet.date}
          open
          onOpenChange={(o) => !o && setSheet(null)}
          onDelete={setDeleting}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`«${deleting.title}» حذف شود؟`}
          description={`${formatDate(deleting.date, "full")} دیگر تعطیل نیست و در محاسبه‌ی مهلت کارها روز کاری شمرده می‌شود.`}
          confirmLabel="حذف"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </>
  )
}

/** موبایل: یک ماه در هر لحظه؛ رفتن به ماه سال دیگر، سال صفحه را هم عوض می‌کند. */
function MobileMonths({ year, onYearChange, onDayClick }: { year: number; onYearChange: (y: number) => void; onDayClick: (d: Date | null) => void }) {
  const [month, setMonth] = React.useState(() => {
    const today = new Date()
    return { year, month: year === getYear(today) ? getMonth(today) + 1 : 1, day: 1 }
  })
  const shown = month.year === year ? month : { year, month: 1, day: 1 }
  return (
    <JalaliCalendar
      value={null}
      onChange={onDayClick}
      visibleMonth={shown}
      onVisibleMonthChange={(m) => {
        setMonth({ ...m, day: 1 })
        if (m.year !== year) onYearChange(m.year)
      }}
      className="mx-auto rounded-lg border"
    />
  )
}
