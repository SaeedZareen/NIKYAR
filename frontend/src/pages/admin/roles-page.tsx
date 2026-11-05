import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber } from "@/lib/format"
import { RoleSheet } from "./role-sheet"

type Role = Schemas["Role"]
const EMPTY: Role[] = []
const col = columnHelper<Role>()

export default function RolesPage() {
  const qc = useQueryClient()
  const view = useTableView("roles", { defaultSort: "name" })
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => unwrap(api.GET("/api/auth/roles/")) })
  const [editing, setEditing] = React.useState<{ role: Role | null } | null>(null)
  const [deleting, setDeleting] = React.useState<Role | null>(null)
  const remove = useMutation({
    mutationFn: (r: Role) => unwrap(api.DELETE("/api/auth/roles/{id}/", { params: { path: { id: r.id } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] })
      toast.success("نقش حذف شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns = React.useMemo(
    () => [
      col.accessor("name", { header: "عنوان نقش", meta: { label: "عنوان نقش", primary: true } }),
      col.accessor("description", { header: "توضیح", enableSorting: false, meta: { label: "توضیح", wrap: true } }),
      col.accessor((r) => r.permissions.length, {
        id: "permission_count",
        header: "تعداد مجوز",
        sortFn: "basic",
        meta: { label: "تعداد مجوز", align: "end" as const },
        cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span>,
      }),
      col.accessor("user_count", {
        header: "تعداد کاربر",
        sortFn: "basic",
        meta: { label: "تعداد کاربر", align: "end" as const },
        cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span>,
      }),
      actionsColumn<Role>((r) => (
        <>
          <DropdownMenuItem onSelect={() => setEditing({ role: r })}>
            <Pencil /> ویرایش
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
            <Trash2 /> حذف
          </DropdownMenuItem>
        </>
      )),
    ],
    []
  )
  const table = useDataTable({ view, columns, data: roles.data ?? EMPTY, getRowId: (r) => String(r.id) })

  return (
    <>
      <PageHeader
        title="نقش‌ها و مجوزها"
        description="هر نقش مجموعه‌ای از مجوزهاست؛ نقش‌ها را در صفحه‌ی کاربران به افراد بدهید."
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          <Button onClick={() => setEditing({ role: null })}>
            <Plus /> نقش جدید
          </Button>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="فهرست نقش‌ها"
        loading={roles.isPending}
        error={roles.error}
        onRetry={() => roles.refetch()}
        searchPlaceholder="عنوان یا توضیح نقش"
        empty={{ title: "هنوز نقشی تعریف نشده است", description: "برای دادن مجوز به کاربران، ابتدا نقش بسازید." }}
      />
      {editing && <RoleSheet key={editing.role?.id ?? "new"} role={editing.role} open onOpenChange={(o) => !o && setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`نقش «${deleting.name}» حذف شود؟`}
          description="نقشی که به کاربری داده شده باشد حذف نمی‌شود؛ ابتدا آن را از کاربران بگیرید."
          confirmLabel="حذف"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </>
  )
}
