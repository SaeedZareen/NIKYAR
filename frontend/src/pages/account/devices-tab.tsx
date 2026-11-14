import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LogOut } from "lucide-react"
import { toast } from "sonner"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"

type Device = Schemas["Device"]
const KEY = ["session", "devices"]
const EMPTY: Device[] = []
const col = columnHelper<Device>()

/** «حساب من › دستگاه‌ها»: ورودهای باز همین کاربر، خروج یک دستگاه یا همه‌ی دستگاه‌های دیگر (مثلاً گوشی گم‌شده). */
export function DevicesTab() {
  const qc = useQueryClient()
  const devices = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/auth/session/devices/")) })
  const end = useMutation({
    mutationFn: (id?: number) => unwrap(api.DELETE("/api/auth/session/devices/", { params: { query: id ? { id } : {} } })),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success(id ? "از آن دستگاه خارج شدید." : "از همه‌ی دستگاه‌های دیگر خارج شدید.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const endOne = end.mutate
  const columns = React.useMemo<DataTableColumn<Device>[]>(
    () => [
      col.accessor("device", {
        header: "دستگاه",
        enableSorting: false,
        meta: { label: "دستگاه", primary: true },
        cell: (c) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {c.getValue()}
            {c.row.original.current && <StatusBadge tone="info">همین دستگاه</StatusBadge>}
          </span>
        ),
      }),
      col.accessor("ip", { header: "نشانی", enableSorting: false, meta: { label: "نشانی" }, cell: (c) => <bdi dir="ltr" className="tabular-nums">{toFaDigits(c.getValue())}</bdi> }),
      col.accessor("created_at", { header: "ورود", enableSorting: false, meta: { label: "ورود" }, cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span> }),
      col.accessor("last_seen", { header: "آخرین استفاده", enableSorting: false, meta: { label: "آخرین استفاده" }, cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span> }),
      col.display({
        id: "end",
        header: () => <span className="sr-only">خروج</span>,
        meta: { label: "خروج" },
        cell: (c) =>
          !c.row.original.current && (
            <Button variant="ghost" size="sm" onClick={() => endOne(c.row.original.id)} aria-label={`خروج از ${c.row.original.device}`}>
              <LogOut /> خروج
            </Button>
          ),
      }),
    ],
    [endOne]
  )
  const view = useTableView("account-devices")
  const table = useDataTable({ view, columns, data: devices.data ?? EMPTY, getRowId: (d) => String(d.id) })
  const others = (devices.data ?? EMPTY).filter((d) => !d.current).length

  return (
    <Section
      title="دستگاه‌های من"
      description="رایانه‌ها و گوشی‌هایی که اکنون با حساب شما وارد سامانه هستند. اگر دستگاهی را نمی‌شناسید، از آن خارج شوید و گذرواژه را عوض کنید."
      actions={
        <Button variant="outline" size="sm" disabled={!others || end.isPending} onClick={() => end.mutate(undefined)}>
          <LogOut /> خروج از همه‌ی دستگاه‌های دیگر
        </Button>
      }
    >
      <DataTable table={table} view={view} caption="دستگاه‌های من" compact loading={devices.isPending} empty={{ title: "ورود بازی نیست" }} />
    </Section>
  )
}
