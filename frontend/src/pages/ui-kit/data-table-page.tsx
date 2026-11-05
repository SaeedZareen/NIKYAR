import { Link } from "react-router"
import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { actionsColumn, columnHelper, DataTable, selectColumn, useDataTable, useTableView } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge, type StatusTone } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { formatDate, formatMoney, toFaDigits } from "@/lib/format"
import { employees, STATUS_LABELS, TYPE_LABELS, UNIT_NAMES, type Employee, type EmploymentStatus } from "./sample-data"

const STATUS_TONE: Record<EmploymentStatus, StatusTone> = { active: "success", leave: "warning", terminated: "neutral" }

const col = columnHelper<Employee>()
const columns = [
  selectColumn<Employee>(),
  col.accessor("code", {
    header: "کد پرسنلی",
    size: 96,
    meta: { label: "کد پرسنلی" },
    cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span>,
  }),
  col.accessor((e) => `${e.firstName} ${e.lastName}`, {
    id: "name",
    header: "نام و نام خانوادگی",
    size: 180,
    meta: { label: "نام و نام خانوادگی", primary: true },
  }),
  col.accessor("nationalId", {
    header: "کد ملی",
    size: 120,
    meta: { label: "کد ملی" },
    cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span>,
  }),
  col.accessor("unit", {
    header: "واحد سازمانی",
    size: 140,
    meta: { label: "واحد سازمانی", filterOptions: UNIT_NAMES.map((u) => ({ value: u, label: u })) },
  }),
  col.accessor("position", { header: "سمت", size: 170, meta: { label: "سمت" } }),
  col.accessor("type", {
    header: "نوع استخدام",
    size: 110,
    meta: {
      label: "نوع استخدام",
      filterOptions: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
      exportValue: (e) => TYPE_LABELS[e.type],
    },
    cell: (c) => TYPE_LABELS[c.getValue()],
  }),
  col.accessor("hireDate", {
    header: "تاریخ استخدام",
    size: 116,
    meta: { label: "تاریخ استخدام" },
    cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span>,
  }),
  col.accessor("salary", {
    header: "حقوق پایه",
    size: 150,
    sortFn: "basic",
    meta: { label: "حقوق پایه", align: "end" },
    cell: (c) => <span className="tabular-nums">{formatMoney(c.getValue())}</span>,
  }),
  col.accessor("status", {
    header: "وضعیت",
    size: 110,
    meta: {
      label: "وضعیت",
      filterOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
      exportValue: (e) => STATUS_LABELS[e.status],
    },
    cell: (c) => <StatusBadge tone={STATUS_TONE[c.getValue()]}>{STATUS_LABELS[c.getValue()]}</StatusBadge>,
  }),
  actionsColumn<Employee>((e) => (
    <>
      <DropdownMenuItem asChild>
        <Link to={`/ui-kit/data-table/${e.id}`}>
          <Eye /> مشاهده
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toast.info(`ویرایش «${e.firstName} ${e.lastName}» در فاز پرونده‌ی پرسنلی فعال می‌شود.`)}>
        <Pencil /> ویرایش
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(e.nationalId).then(() => toast.success("کد ملی کپی شد."))}>
        <Copy /> کپی کد ملی
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => toast.warning("حذف در داده‌ی نمونه غیرفعال است.")}>
        <Trash2 /> حذف
      </DropdownMenuItem>
    </>
  )),
]

export default function DataTablePage() {
  const view = useTableView("ui-kit-employees", { defaultSort: "name" })
  const table = useDataTable({ view, columns, data: employees, getRowId: (e) => e.id, enableRowSelection: true })

  return (
    <>
      <PageHeader
        title="جدول داده"
        description="جست‌وجو، فیلتر چندانتخابی، مرتب‌سازی چندستونه (Shift)، انتخاب بازه‌ای، سنجاق و تغییر عرض ستون، خروجی اکسل و نمای موبایل"
        breadcrumbs={[{ label: "کیت رابط کاربری" }]}
        actions={
          <Button onClick={() => toast.info("ثبت پرونده در فاز پرونده‌ی پرسنلی فعال می‌شود.")}>
            <Plus /> پرونده‌ی جدید
          </Button>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="فهرست پرسنل نمونه"
        searchPlaceholder="نام، کد ملی یا سمت"
        rowHref={(e) => `/ui-kit/data-table/${e.id}`}
        exportFileName="پرسنل"
        bulkActions={(rows, clear) => (
          <Button
            variant="outline"
            onClick={() => {
              toast.success(`${toFaDigits(rows.length)} ردیف برای بررسی علامت خورد.`)
              clear()
            }}
          >
            علامت‌گذاری برای بررسی
          </Button>
        )}
      />
    </>
  )
}
