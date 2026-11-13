import * as React from "react"
import { Link } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PackageCheck, PencilRuler } from "lucide-react"
import { toast } from "sonner"
import { DESIGN_PROCESSES_KEY } from "@/app/workflow"
import { columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"

type Ready = Schemas["ReadyProcess"]
const KEY = ["workflow", "ready"]
const col = columnHelper<Ready>()

function statusOf(r: Ready) {
  if (r.active) return { label: "فعال", tone: "success" as const }
  return r.process ? { label: "غیرفعال", tone: "neutral" as const } : { label: "نصب نشده", tone: "neutral" as const }
}

/**
 * «فرایندهای آماده»: فرم و فرایندهایی که برنامه و ماژول‌ها همراه دارند؛ فعال‌سازی هر کدام (یا همه) آن را با فرم منتشرشده
 * نصب می‌کند و در «درخواست جدید» کارکنان می‌گذارد. پس از نصب، در فرایندساز و فرم‌ساز مثل بقیه تغییر می‌کند.
 */
export default function ReadyProcessesPage() {
  const qc = useQueryClient()
  const rows = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/workflow/ready/")) })
  const refresh = (data: Ready[]) => {
    qc.setQueryData(KEY, data)
    qc.invalidateQueries({ queryKey: DESIGN_PROCESSES_KEY })
    qc.invalidateQueries({ queryKey: ["workflow", "start"] })
  }
  const toggle = useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) => unwrap(api.POST("/api/workflow/ready/{id}/active/", { params: { path: { id: code } }, body: { active } })),
    onSuccess: (saved) => {
      refresh((rows.data ?? []).map((r) => (r.code === saved.code ? saved : r)))
      toast.success(saved.active ? `«${saved.title}» فعال شد و در «درخواست جدید» آمد.` : `«${saved.title}» غیرفعال شد.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const all = useMutation({
    mutationFn: () => unwrap(api.POST("/api/workflow/ready/activate-all/")),
    onSuccess: (data) => {
      refresh(data)
      toast.success("همه‌ی فرایندهای آماده فعال شدند.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const groups = React.useMemo(() => {
    const map = new Map<string, Ready[]>()
    for (const r of rows.data ?? []) map.set(r.group, [...(map.get(r.group) ?? []), r])
    return [...map.entries()]
  }, [rows.data])
  const inactive = (rows.data ?? []).filter((r) => !r.active).length

  return (
    <>
      <PageHeader
        title="فرایندهای آماده"
        description="فرم و فرایندهایی که همراه نیک‌یار می‌آیند. با فعال‌سازی، فرم و فرایند منتشرشده ساخته می‌شود و کارکنان آن را در «درخواست جدید» می‌بینند. پس از فعال‌سازی، هر کدام را در «طراحی فرایندها» و «طراحی فرم‌ها» مثل بقیه تغییر دهید؛ غیرفعال‌سازی چیزی را پاک نمی‌کند."
        breadcrumbs={[{ label: "طراحی فرایندها", to: "/workflow/design" }]}
        meta={rows.data ? `${toFaDigits(rows.data.length - inactive)} از ${toFaDigits(rows.data.length)} فعال` : undefined}
        actions={
          inactive > 0 && (
            <Button onClick={() => all.mutate()} disabled={all.isPending}>
              <PackageCheck /> فعال‌سازی همه
            </Button>
          )
        }
      />
      {rows.isPending || rows.error ? (
        <ReadyGroup title="فرایندهای آماده" rows={[]} loading={rows.isPending} error={rows.error} onRetry={() => rows.refetch()} onToggle={() => {}} busy={false} />
      ) : groups.length === 0 ? (
        <Section title="فرایندهای آماده">
          <p className="text-xs text-muted-foreground">در این نصب فرایند آماده‌ای نیست؛ فرایندهای آماده همراه ماژول‌ها (مثل پرونده‌ی پرسنلی) می‌آیند.</p>
        </Section>
      ) : (
        groups.map(([group, items]) => (
          <ReadyGroup key={group} title={group} rows={items} onToggle={(code, active) => toggle.mutate({ code, active })} busy={toggle.isPending || all.isPending} />
        ))
      )}
    </>
  )
}

type GroupProps = { title: string; rows: Ready[]; loading?: boolean; error?: unknown; onRetry?: () => void; onToggle: (code: string, active: boolean) => void; busy: boolean }

function ReadyGroup({ title, rows, loading, error, onRetry, onToggle, busy }: GroupProps) {
  const columns = React.useMemo<DataTableColumn<Ready>[]>(
    () => [
      col.accessor("title", {
        header: "فرایند",
        meta: { label: "فرایند", primary: true, wrap: true },
        cell: (c) => (
          <span className="flex flex-col gap-0.5">
            <span>{c.getValue()}</span>
            <span className="text-2xs text-muted-foreground">{c.row.original.description}</span>
          </span>
        ),
      }),
      col.accessor((r) => statusOf(r).label, {
        id: "status",
        header: "وضعیت",
        meta: { label: "وضعیت" },
        cell: (c) => <StatusBadge tone={statusOf(c.row.original).tone}>{statusOf(c.row.original).label}</StatusBadge>,
      }),
      col.accessor("active", {
        header: "فعال",
        enableSorting: false,
        meta: { label: "فعال" },
        cell: (c) => <Switch aria-label={`فعال بودن ${c.row.original.title}`} checked={c.getValue()} disabled={busy} onCheckedChange={(on) => onToggle(c.row.original.code, on)} />,
      }),
      col.display({
        id: "design",
        header: "تغییر",
        meta: { label: "تغییر" },
        cell: (c) =>
          c.row.original.process ? (
            <Button asChild variant="ghost" size="sm">
              <Link to={`/workflow/design/${c.row.original.process}`}>
                <PencilRuler /> فرایندساز
              </Link>
            </Button>
          ) : (
            <span className="text-2xs text-muted-foreground">پس از فعال‌سازی</span>
          ),
      }),
    ],
    [busy, onToggle]
  )
  const view = useTableView(`workflow-ready-${title}`)
  const table = useDataTable({ view, columns, data: rows, getRowId: (r) => r.code })
  return (
    <Section title={title}>
      <DataTable table={table} view={view} caption={title} compact loading={loading} error={error} onRetry={onRetry} empty={{ title: "فرایندی نیست" }} />
    </Section>
  )
}
