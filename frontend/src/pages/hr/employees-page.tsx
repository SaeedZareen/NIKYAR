import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { FileSpreadsheet, FileUp, UserPlus } from "lucide-react"
import { Link } from "react-router"
import { useAuth } from "@/app/auth"
import { useLookupItems } from "@/app/lookups"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { fieldColumn, fieldColumnId, valueFields } from "@/components/form-renderer/field-columns"
import { useUnitOptions } from "@/components/form-renderer/org-options"
import { useNames } from "@/components/form-renderer/value-text"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDate, toFaDigits } from "@/lib/format"
import { EmployeeSheet } from "./employee-sheet"
import { EMPLOYEES_KEY, STATUS_TONES, useCustomFields } from "./employees"

type Employee = Schemas["Employee"]
const EMPTY: Employee[] = []
const col = columnHelper<Employee>()

/** پرونده‌های پرسنلی: همه برای `hr.view`، کارکنان واحد برای مدیر همان واحد؛ «پرونده‌ی تازه» برای `hr.manage`. */
export default function EmployeesPage() {
  const { can } = useAuth()
  const canManage = can("hr.manage")
  const [creating, setCreating] = React.useState(false)
  const employees = useQuery({ queryKey: EMPLOYEES_KEY, queryFn: () => unwrap(api.GET("/api/hr/employees/")) })
  const kinds = useLookupItems("employment-type").data
  const units = useUnitOptions()
  // فیلدهای دلخواه پرونده هم ستون می‌شوند (سه تای نخست نمایان، بقیه از «نما»)
  const definition = useCustomFields().data?.definition as FormDefinition | undefined
  const extraFields = React.useMemo(() => (definition ? valueFields(definition) : []), [definition])
  const extras = React.useMemo(() => (employees.data ?? EMPTY).map((e) => e.extra as Record<string, unknown>), [employees.data])
  const names = useNames(definition, extras)

  const columns = React.useMemo<DataTableColumn<Employee>[]>(
    () => [
      col.accessor("personnel_code", { header: "کد پرسنلی", meta: { label: "کد پرسنلی" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span> }),
      col.accessor("full_name", { header: "نام و نام خانوادگی", meta: { label: "نام و نام خانوادگی", primary: true, wrap: true } }),
      col.accessor("national_code", { header: "کد ملی", meta: { label: "کد ملی" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span> }),
      col.accessor((e) => String(e.unit ?? ""), {
        id: "unit",
        header: "واحد",
        meta: { label: "واحد", wrap: true, filterOptions: units.map((u) => ({ value: u.value, label: u.label })), exportValue: (e) => e.unit_name },
        cell: (c) => c.row.original.unit_name || "—",
      }),
      col.accessor("position", { header: "سمت", enableSorting: false, meta: { label: "سمت", wrap: true }, cell: (c) => c.getValue() || "—" }),
      col.accessor((e) => String(e.employment_type), {
        id: "employment_type",
        header: "نوع استخدام",
        meta: {
          label: "نوع استخدام",
          filterOptions: (kinds ?? []).map((k) => ({ value: String(k.id), label: k.title })),
          exportValue: (e) => e.employment_type_title,
        },
        cell: (c) => c.row.original.employment_type_title,
      }),
      col.accessor("hire_date", { header: "تاریخ استخدام", meta: { label: "تاریخ استخدام" }, cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span> }),
      col.accessor("status", {
        header: "وضعیت",
        meta: {
          label: "وضعیت",
          filterOptions: [
            { value: "active", label: "شاغل" },
            { value: "separated", label: "پایان همکاری" },
          ],
          exportValue: (e) => e.status_label,
        },
        cell: (c) => <StatusBadge tone={STATUS_TONES[c.row.original.status]}>{c.row.original.status_label}</StatusBadge>,
      }),
      ...extraFields.map((f) => fieldColumn<Employee>(f, names, (e) => e.extra as Record<string, unknown>)),
    ],
    [kinds, units, extraFields, names]
  )
  const defaultHidden = React.useMemo(() => extraFields.slice(3).map(fieldColumnId), [extraFields])
  const view = useTableView("hr-employees", { defaultSort: "full_name", defaultHidden })
  const table = useDataTable({ view, columns, data: employees.data ?? EMPTY, getRowId: (e) => String(e.id) })

  return (
    <>
      <PageHeader
        title="پرونده‌های پرسنلی"
        description="پرونده‌ی هر کارمند با مشخصات، استخدام و سمت‌ها. مدیر هر واحد کارکنان واحد خود و زیرواحدهایش را فقط می‌بیند."
        meta={employees.data ? `${toFaDigits(employees.data.filter((e) => e.status === "active").length)} کارمند شاغل` : undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/hr/employees/export/" download>
                <FileSpreadsheet /> خروجی کامل اکسل
              </a>
            </Button>
            {canManage && (
              <>
                <Button asChild variant="outline">
                  <Link to="/hr/employees/import">
                    <FileUp /> ورود از اکسل
                  </Link>
                </Button>
                <Button onClick={() => setCreating(true)}>
                  <UserPlus /> پرونده‌ی تازه
                </Button>
              </>
            )}
          </>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="پرونده‌های پرسنلی"
        loading={employees.isPending}
        error={employees.error}
        onRetry={() => employees.refetch()}
        rowHref={(e) => `/hr/employees/${e.id}`}
        searchPlaceholder="نام، کد پرسنلی یا کد ملی"
        exportFileName="پرونده‌های پرسنلی"
        empty={{ title: "هنوز پرونده‌ای ثبت نشده است" }}
      />
      {creating && <EmployeeSheet employee={null} open onOpenChange={setCreating} />}
    </>
  )
}
