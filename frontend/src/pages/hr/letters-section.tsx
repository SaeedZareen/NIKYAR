import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"
import { EMPLOYEES_KEY } from "./employees"

type Letter = Schemas["Letter"]
const col = columnHelper<Letter>()

/** نامه‌ها و گواهی‌های صادرشده‌ی پرونده با پیوند برگه‌ی چاپ رسمی. */
export function LettersSection({ employee }: { employee: Schemas["EmployeeDetail"] }) {
  const letters = useQuery({
    queryKey: [...EMPLOYEES_KEY, String(employee.id), "letters"],
    queryFn: () => unwrap(api.GET("/api/hr/letters/", { params: { query: { employee: employee.id } } })),
  })
  const columns = React.useMemo<DataTableColumn<Letter>[]>(
    () => [
      col.accessor("kind_label", { header: "نامه", meta: { label: "نامه", primary: true } }),
      col.accessor("number", { header: "شماره", meta: { label: "شماره" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span> }),
      col.accessor("issued_on", { header: "تاریخ", meta: { label: "تاریخ" }, cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span> }),
      col.accessor("recipient", { header: "گیرنده", enableSorting: false, meta: { label: "گیرنده", wrap: true }, cell: (c) => c.getValue() || "—" }),
      col.display({
        id: "print",
        header: "چاپ",
        meta: { label: "چاپ" },
        cell: (c) => (
          <Button asChild variant="ghost" size="sm">
            <a href={`/print/letters/${c.row.original.id}`} target="_blank" rel="noreferrer" aria-label={`چاپ ${c.row.original.kind_label} ${toFaDigits(c.row.original.number)}`}>
              <Printer /> چاپ
            </a>
          </Button>
        ),
      }),
    ],
    []
  )
  const view = useTableView("hr-letters")
  const table = useDataTable({ view, columns, data: letters.data ?? [], getRowId: (l) => String(l.id) })
  return (
    <Section title="نامه‌ها و گواهی‌ها" description="گواهی‌ها و نامه‌هایی که پس از تأیید منابع انسانی صادر شده‌اند؛ متن هر نامه همان متن زمان صدور است.">
      <DataTable
        table={table}
        view={view}
        caption="نامه‌ها و گواهی‌ها"
        compact
        loading={letters.isPending}
        error={letters.error}
        onRetry={() => letters.refetch()}
        empty={{ title: "هنوز نامه‌ای صادر نشده است" }}
      />
    </Section>
  )
}
