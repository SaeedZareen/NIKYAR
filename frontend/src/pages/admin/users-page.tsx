import * as React from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, UserCheck, UserX } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/app/auth"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"
import { UserSheet } from "./user-sheet"

type User = Schemas["User"]
const EMPTY: User[] = []
const col = columnHelper<User>()

export default function UsersPage() {
  const { can } = useAuth()
  const canManage = can("accounts.users.manage")
  const qc = useQueryClient()
  const view = useTableView("users", { defaultSort: "last_name" })
  const users = useQuery({
    queryKey: ["users", view.query],
    queryFn: () => unwrap(api.GET("/api/auth/users/", { params: { query: view.query } })),
    placeholderData: keepPreviousData,
  })
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => unwrap(api.GET("/api/auth/roles/")) })

  const [editing, setEditing] = React.useState<{ user: User | null } | null>(null)
  const [toggling, setToggling] = React.useState<User | null>(null)
  const setActive = useMutation({
    mutationFn: (u: User) => unwrap(api.PATCH("/api/auth/users/{id}/", { params: { path: { id: u.id } }, body: { is_active: !u.is_active } })),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success(u.is_active ? `حساب «${u.full_name}» فعال شد.` : `حساب «${u.full_name}» غیرفعال شد.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns = React.useMemo<DataTableColumn<User>[]>(
    () => [
      col.accessor("full_name", { id: "last_name", header: "نام و نام خانوادگی", meta: { label: "نام و نام خانوادگی", primary: true, wrap: true } }),
      col.accessor("username", {
        header: "نام کاربری",
        meta: { label: "نام کاربری" },
        cell: (c) => <bdi dir="ltr">{c.getValue()}</bdi>,
      }),
      col.accessor("mobile", {
        header: "موبایل",
        enableSorting: false,
        meta: { label: "موبایل" },
        cell: (c) => (c.getValue() ? <span className="tabular-nums">{toFaDigits(c.getValue())}</span> : "—"),
      }),
      col.accessor((u) => u.role_names.join("، "), {
        id: "roles",
        header: "نقش‌ها",
        enableSorting: false,
        meta: {
          label: "نقش‌ها",
          wrap: true,
          filterOptions: (roles.data ?? []).map((r) => ({ value: String(r.id), label: r.name })),
        },
        cell: (c) =>
          c.row.original.is_superuser ? <Badge variant="secondary">مدیر کل</Badge> : c.getValue() || <span className="text-muted-foreground">بدون نقش</span>,
      }),
      col.accessor((u) => u.positions.join("، "), {
        id: "positions",
        header: "سمت",
        enableSorting: false,
        meta: { label: "سمت", wrap: true },
        cell: (c) => c.getValue() || <span className="text-muted-foreground">بدون سمت</span>,
      }),
      col.accessor("last_login", {
        header: "آخرین ورود",
        meta: { label: "آخرین ورود" },
        cell: (c) => (c.getValue() ? <span className="tabular-nums">{formatDateTime(c.getValue())}</span> : <span className="text-muted-foreground">هنوز وارد نشده</span>),
      }),
      col.accessor((u) => String(u.is_active), {
        id: "is_active",
        header: "وضعیت",
        enableSorting: false,
        meta: {
          label: "وضعیت",
          filterOptions: [
            { value: "true", label: "فعال" },
            { value: "false", label: "غیرفعال" },
          ],
          exportValue: (u) => (u.is_active ? "فعال" : "غیرفعال"),
        },
        cell: (c) => <StatusBadge tone={c.row.original.is_active ? "success" : "neutral"}>{c.row.original.is_active ? "فعال" : "غیرفعال"}</StatusBadge>,
      }),
      ...(canManage
        ? [
            actionsColumn<User>((u) => (
              <>
                <DropdownMenuItem onSelect={() => setEditing({ user: u })}>
                  <Pencil /> ویرایش
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setToggling(u)}>
                  {u.is_active ? <UserX /> : <UserCheck />} {u.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}
                </DropdownMenuItem>
              </>
            )),
          ]
        : []),
    ],
    [roles.data, canManage]
  )

  const table = useDataTable({ view, columns, data: users.data?.results ?? EMPTY, rowCount: users.data?.count ?? 0, getRowId: (u) => String(u.id) })

  return (
    <>
      <PageHeader
        title="کاربران"
        description="حساب‌های کاربری، نقش‌ها و وضعیت دسترسی"
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          canManage && (
            <Button onClick={() => setEditing({ user: null })}>
              <Plus /> کاربر جدید
            </Button>
          )
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="فهرست کاربران"
        loading={users.isFetching}
        error={users.error}
        onRetry={() => users.refetch()}
        searchPlaceholder="نام، نام کاربری، ایمیل یا موبایل"
        exportFileName="کاربران"
        empty={{ title: "هنوز کاربری تعریف نشده است" }}
      />
      {editing && <UserSheet key={editing.user?.id ?? "new"} user={editing.user} open onOpenChange={(o) => !o && setEditing(null)} />}
      {toggling && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setToggling(null)}
          title={toggling.is_active ? "حساب غیرفعال شود؟" : "حساب فعال شود؟"}
          description={
            toggling.is_active
              ? `«${toggling.full_name}» دیگر نمی‌تواند وارد سامانه شود. سوابق و کارهای او حفظ می‌شود.`
              : `«${toggling.full_name}» دوباره می‌تواند وارد سامانه شود.`
          }
          confirmLabel={toggling.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}
          destructive={toggling.is_active}
          onConfirm={() => setActive.mutateAsync(toggling)}
        />
      )}
    </>
  )
}
