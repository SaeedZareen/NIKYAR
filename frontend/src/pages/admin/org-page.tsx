import * as React from "react"
import { useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, ChevronDown, Crown, Pencil, Plus, Trash2, UserMinus, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/app/auth"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { DescriptionList } from "@/components/description-list"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { formatNumber, toJalaliString } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AssignSheet, PositionSheet, UnitSheet, type Position, type Unit } from "./org-sheets"

type Holder = Position["holders"][number]
const EMPTY: Position[] = []
const col = columnHelper<Position>()

type Dialog =
  | { kind: "unit"; unit: Unit | null; parentId: number | null }
  | { kind: "position"; position: Position | null }
  | { kind: "assign"; position: Position }
  | { kind: "delete-unit"; unit: Unit }
  | { kind: "delete-position"; position: Position }
  | { kind: "end"; holder: Holder; position: Position }

export default function OrgPage() {
  const { can } = useAuth()
  const canManage = can("org.manage")
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = React.useState<Dialog | null>(null)
  const close = () => setDialog(null)

  const units = useQuery({ queryKey: ["org", "units"], queryFn: () => unwrap(api.GET("/api/org/units/")) })
  const selectedId = Number(params.get("unit")) || units.data?.find((u) => u.parent === null)?.id
  const selected = units.data?.find((u) => u.id === selectedId) ?? null
  const positions = useQuery({
    queryKey: ["org", "positions", selectedId],
    queryFn: () => unwrap(api.GET("/api/org/positions/", { params: { query: { unit: String(selectedId) } } })),
    enabled: !!selectedId,
  })

  const select = (id: number) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set("unit", String(id))
        return next
      },
      { replace: true }
    )

  const mutate = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns = React.useMemo<DataTableColumn<Position>[]>(
    () => [
      col.accessor("title", {
        header: "عنوان سمت",
        meta: { label: "عنوان سمت", primary: true, wrap: true },
        cell: (c) => (
          <span className="flex flex-wrap items-center gap-2">
            {c.getValue()}
            {c.row.original.is_manager && (
              <Badge variant="secondary">
                <Crown aria-hidden /> مدیر واحد
              </Badge>
            )}
          </span>
        ),
      }),
      col.accessor((p) => p.holders.map((h) => h.name).join("، "), {
        id: "holders",
        header: "متصدی",
        enableSorting: false,
        meta: { label: "متصدی", wrap: true },
        cell: (c) =>
          c.row.original.holders.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {c.row.original.holders.map((h) => (
                <li key={h.assignment}>
                  <Badge variant="outline" className="gap-1 pe-0.5">
                    {h.name}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`پایان انتصاب ${h.name}`}
                        onClick={() => setDialog({ kind: "end", holder: h, position: c.row.original })}
                      >
                        <UserMinus />
                      </Button>
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">بدون متصدی</span>
          ),
      }),
      col.accessor((p) => String(p.is_active), {
        id: "is_active",
        header: "وضعیت",
        enableSorting: false,
        meta: { label: "وضعیت", exportValue: (p) => (p.is_active ? "فعال" : "غیرفعال") },
        cell: (c) => <StatusBadge tone={c.row.original.is_active ? "success" : "neutral"}>{c.row.original.is_active ? "فعال" : "غیرفعال"}</StatusBadge>,
      }),
      ...(canManage
        ? [
            actionsColumn<Position>((p) => (
              <>
                <DropdownMenuItem disabled={!p.is_active} onSelect={() => setDialog({ kind: "assign", position: p })}>
                  <UserPlus /> انتصاب فرد
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ kind: "position", position: p })}>
                  <Pencil /> ویرایش سمت
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete-position", position: p })}>
                  <Trash2 /> حذف سمت
                </DropdownMenuItem>
              </>
            )),
          ]
        : []),
    ],
    [canManage]
  )
  const view = useTableView("org-positions", { urlKey: "p." })
  const table = useDataTable({ view, columns, data: positions.data ?? EMPTY, getRowId: (p) => String(p.id) })

  return (
    <>
      <PageHeader
        title="ساختار سازمانی"
        description="واحدها، سمت‌ها و افراد هر سمت؛ ارجاع کارها (مثل «مدیر مستقیم») بر همین اساس است."
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          canManage && (
            <Button onClick={() => setDialog({ kind: "unit", unit: null, parentId: null })}>
              <Plus /> واحد جدید
            </Button>
          )
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Section title="واحدها" contentClassName="p-2">
          {units.isPending ? (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          ) : (
            <UnitTree units={units.data ?? []} selectedId={selectedId} onSelect={select} />
          )}
        </Section>

        {selected ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Section
              title={selected.name}
              meta={selected.is_active ? undefined : "بایگانی‌شده"}
              actions={
                canManage && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "unit", unit: null, parentId: selected.id })}>
                      <Plus /> زیرواحد
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "unit", unit: selected, parentId: selected.parent })}>
                      <Pencil /> ویرایش
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDialog({ kind: "delete-unit", unit: selected })}>
                      <Trash2 /> حذف
                    </Button>
                  </>
                )
              }
            >
              <DescriptionList
                items={[
                  { label: "واحد بالادست", value: units.data?.find((u) => u.id === selected.parent)?.name ?? "بالاترین سطح" },
                  { label: "کد", value: selected.code || null, ltr: true },
                  { label: "تعداد سمت فعال", value: formatNumber(selected.position_count) },
                  { label: "تعداد افراد", value: formatNumber(selected.member_count) },
                ]}
              />
            </Section>
            <Section
              title="سمت‌ها"
              actions={
                canManage && (
                  <Button size="sm" onClick={() => setDialog({ kind: "position", position: null })}>
                    <Plus /> سمت جدید
                  </Button>
                )
              }
            >
              <DataTable
                table={table}
                view={view}
                caption={`سمت‌های ${selected.name}`}
                loading={positions.isPending}
                error={positions.error}
                onRetry={() => positions.refetch()}
                searchPlaceholder="عنوان سمت یا نام متصدی"
                empty={{ title: "این واحد هنوز سمتی ندارد", description: "سمت‌ها را تعریف و افراد را در آن‌ها منصوب کنید." }}
              />
            </Section>
          </div>
        ) : (
          !units.isPending && (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2 />
                </EmptyMedia>
                <EmptyTitle>هنوز واحدی تعریف نشده است</EmptyTitle>
                <EmptyDescription>با «واحد جدید» بالاترین واحد سازمان (مثلاً مدیریت عامل) را بسازید.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        )}
      </div>

      {dialog?.kind === "unit" && <UnitSheet open onOpenChange={close} unit={dialog.unit} parentId={dialog.parentId} units={units.data ?? []} />}
      {dialog?.kind === "position" && selected && <PositionSheet open onOpenChange={close} position={dialog.position} unit={selected} />}
      {dialog?.kind === "assign" && <AssignSheet open onOpenChange={close} position={dialog.position} />}
      {dialog?.kind === "delete-unit" && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={`واحد «${dialog.unit.name}» حذف شود؟`}
          description="واحدی که زیرواحد یا سمت دارد حذف نمی‌شود؛ می‌توانید به‌جای حذف، آن را غیرفعال کنید."
          confirmLabel="حذف"
          destructive
          onConfirm={() =>
            mutate.mutateAsync(async () => {
              await unwrap(api.DELETE("/api/org/units/{id}/", { params: { path: { id: dialog.unit.id } } }))
              setParams({}, { replace: true })
              toast.success("واحد حذف شد.")
            })
          }
        />
      )}
      {dialog?.kind === "delete-position" && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={`سمت «${dialog.position.title}» حذف شود؟`}
          description="سمتی که سابقه‌ی انتصاب دارد حذف نمی‌شود؛ آن را غیرفعال کنید تا سوابق حفظ شود."
          confirmLabel="حذف"
          destructive
          onConfirm={() =>
            mutate.mutateAsync(async () => {
              await unwrap(api.DELETE("/api/org/positions/{id}/", { params: { path: { id: dialog.position.id } } }))
              toast.success("سمت حذف شد.")
            })
          }
        />
      )}
      {dialog?.kind === "end" && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title="پایان انتصاب؟"
          description={`«${dialog.holder.name}» از امروز دیگر در سمت «${dialog.position.title}» نیست. سابقه‌ی انتصاب حفظ می‌شود.`}
          confirmLabel="پایان انتصاب"
          destructive
          onConfirm={() =>
            mutate.mutateAsync(async () => {
              await unwrap(
                api.PATCH("/api/org/assignments/{id}/", { params: { path: { id: dialog.holder.assignment } }, body: { end_date: toJalaliString(new Date()) } })
              )
              qc.invalidateQueries({ queryKey: ["users"] })
              toast.success("انتصاب پایان یافت.")
            })
          }
        />
      )}
    </>
  )
}

/** درخت واحدها: باز و بسته‌شدن شاخه‌ها؛ واحد انتخاب‌شده با aria-current مشخص است. */
function UnitTree({ units, selectedId, onSelect }: { units: Unit[]; selectedId?: number; onSelect: (id: number) => void }) {
  const children = React.useMemo(() => {
    const map = new Map<number | null, Unit[]>()
    for (const u of units) map.set(u.parent, [...(map.get(u.parent) ?? []), u])
    return map
  }, [units])
  const [closed, setClosed] = React.useState<Set<number>>(new Set())
  const toggle = (id: number) =>
    setClosed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const render = (parent: number | null, depth: number): React.ReactNode => {
    const items = children.get(parent)
    if (!items?.length) return null
    return (
      <ul className={cn("flex flex-col gap-0.5", depth > 0 && "ms-3 border-s ps-1")}>
        {items.map((u) => {
          const hasChildren = !!children.get(u.id)?.length
          const open = !closed.has(u.id)
          return (
            <li key={u.id}>
              <div className={cn("flex items-center gap-0.5 rounded-md", u.id === selectedId && "bg-accent text-accent-foreground")}>
                {hasChildren ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-expanded={open}
                    aria-label={open ? `بستن زیرواحدهای ${u.name}` : `نمایش زیرواحدهای ${u.name}`}
                    onClick={() => toggle(u.id)}
                  >
                    <ChevronDown className={cn("transition-transform", !open && "rotate-90")} />
                  </Button>
                ) : (
                  <span className="size-6 shrink-0" aria-hidden />
                )}
                <button
                  type="button"
                  aria-current={u.id === selectedId ? "true" : undefined}
                  onClick={() => onSelect(u.id)}
                  className={cn(
                    "flex min-h-7 flex-1 items-center justify-between gap-2 rounded-md px-1.5 text-start text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
                    u.id === selectedId && "font-semibold hover:bg-transparent",
                    !u.is_active && "text-muted-foreground line-through"
                  )}
                >
                  <span>{u.name}</span>
                  <span className="text-muted-foreground tabular-nums">{formatNumber(u.member_count)}</span>
                </button>
              </div>
              {hasChildren && open && render(u.id, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  return units.length ? (
    <nav aria-label="درخت واحدهای سازمانی">{render(null, 0)}</nav>
  ) : (
    <p className="p-2 text-xs text-muted-foreground">هنوز واحدی تعریف نشده است.</p>
  )
}
