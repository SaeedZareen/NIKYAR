import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CircleX } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { StatusBadge } from "@/components/status-badge"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDate } from "@/lib/format"
import { DELEGATIONS_KEY } from "@/app/delegations"

export type Delegation = Schemas["Delegation"]
const col = columnHelper<Delegation>()
const STATUS = {
  active: { label: "جاری", tone: "success" },
  upcoming: { label: "آینده", tone: "info" },
  past: { label: "پایان‌یافته", tone: "neutral" },
} as const

type Props = {
  id: string
  caption: string
  rows: Delegation[]
  loading: boolean
  error: unknown
  onRetry: () => void
  /** ستون‌های اصیل و جانشین (در «حساب من» یکی از آن‌ها همیشه خود کاربر است). */
  show: { principal: boolean; delegate: boolean }
  /** لغو مجاز است (اصیل یا راهبر سامانه). */
  canCancel: boolean
  empty: string
  /** فهرست کوتاه شخصی: بدون نوار ابزار و صفحه‌بندی. */
  compact?: boolean
}

/** جدول جانشینی‌ها با وضعیت (جاری، آینده، پایان‌یافته) و لغو. */
export function DelegationTable({ id, caption, rows, loading, error, onRetry, show, canCancel, empty, compact }: Props) {
  const qc = useQueryClient()
  const [cancelling, setCancelling] = React.useState<Delegation | null>(null)
  const cancel = useMutation({
    mutationFn: (d: Delegation) => unwrap(api.DELETE("/api/delegations/{id}/", { params: { path: { id: d.id } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DELEGATIONS_KEY })
      toast.success("جانشینی لغو شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const columns = React.useMemo<DataTableColumn<Delegation>[]>(
    () => [
      ...(show.principal ? [col.accessor("principal_name", { header: "اصیل", meta: { label: "اصیل", primary: true } })] : []),
      ...(show.delegate ? [col.accessor("delegate_name", { header: "جانشین", meta: { label: "جانشین", primary: !show.principal } })] : []),
      col.accessor("start_date", { header: "از تاریخ", meta: { label: "از تاریخ" }, cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span> }),
      col.accessor("end_date", { header: "تا تاریخ", meta: { label: "تا تاریخ" }, cell: (c) => <span className="tabular-nums">{formatDate(c.getValue())}</span> }),
      col.accessor("reason", { header: "علت", enableSorting: false, meta: { label: "علت", wrap: true }, cell: (c) => c.getValue() || "—" }),
      col.accessor("status", {
        header: "وضعیت",
        enableSorting: false,
        meta: {
          label: "وضعیت",
          filterOptions: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
          exportValue: (d) => STATUS[d.status as keyof typeof STATUS].label,
        },
        cell: (c) => {
          const s = STATUS[c.getValue() as keyof typeof STATUS]
          return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
        },
      }),
      ...(canCancel
        ? [
            actionsColumn<Delegation>((d) =>
              d.status === "past" ? null : (
                <DropdownMenuItem variant="destructive" onSelect={() => setCancelling(d)}>
                  <CircleX /> لغو جانشینی
                </DropdownMenuItem>
              )
            ),
          ]
        : []),
    ],
    [show.principal, show.delegate, canCancel, setCancelling]
  )
  const view = useTableView(id, { urlKey: `${id}.`, defaultSort: "-start_date" })
  const table = useDataTable({ view, columns, data: rows, getRowId: (d) => String(d.id) })

  return (
    <>
      <DataTable table={table} view={view} caption={caption} loading={loading} error={error} onRetry={onRetry} exportFileName={caption} empty={{ title: empty }} compact={compact} />
      {cancelling && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setCancelling(null)}
          title="جانشینی لغو شود؟"
          description={
            cancelling.status === "active"
              ? `${cancelling.delegate_name} از امروز دیگر جانشین ${cancelling.principal_name} نیست؛ سابقه‌ی این جانشینی تا دیروز می‌ماند.`
              : `جانشینی ${cancelling.delegate_name} برای ${cancelling.principal_name} حذف می‌شود.`
          }
          confirmLabel="لغو جانشینی"
          destructive
          onConfirm={() => cancel.mutateAsync(cancelling)}
        />
      )}
    </>
  )
}
