import * as React from "react"
import { Link } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArchiveRestore, DatabaseBackup, Download, Settings, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/app/auth"
import { useBranding } from "@/app/branding"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatFileSize, formatNumber, toFaDigits } from "@/lib/format"
import { RestoredDialog, UploadRestoreDialog } from "./restore-dialogs"

type Backup = Schemas["Backup"]
type RestoreResult = Schemas["RestoreResult"]
const KEY = ["backups"]
const EMPTY: Backup[] = []
const col = columnHelper<Backup>()
const TONES: Record<string, "info" | "success" | "warning" | "neutral"> = { manual: "info", daily: "success", "pre-restore": "warning", "pre-switch": "warning", uploaded: "neutral" }

export default function BackupsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const { name: orgName } = useBranding()
  const confirmText = orgName.trim() || "بازیابی"
  const backups = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/backups/")) })
  const schedule = useQuery({ queryKey: ["settings", "backup"], queryFn: () => unwrap(api.GET("/api/settings/backup/")), enabled: can("settings.manage") })

  const [restoring, setRestoring] = React.useState<Backup | null>(null)
  const [deleting, setDeleting] = React.useState<Backup | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [restored, setRestored] = React.useState<RestoreResult | null>(null)

  const create = useMutation({
    mutationFn: () => unwrap(api.POST("/api/backups/")),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success(`پشتیبان کامل ساخته شد (${formatFileSize(b.size)}).`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (b: Backup) => unwrap(api.DELETE("/api/backups/{name}/", { params: { path: { name: b.name } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success("پشتیبان حذف شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const restore = useMutation({
    mutationFn: (b: Backup) => unwrap(api.POST("/api/backups/{name}/restore/", { params: { path: { name: b.name } }, body: { confirm: confirmText } })),
    onSuccess: setRestored,
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns = React.useMemo<DataTableColumn<Backup>[]>(
    () => [
      col.accessor("created_at", {
        header: "زمان",
        meta: { label: "زمان", primary: true, exportValue: (b) => formatDateTime(b.created_at) },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      col.accessor("kind", {
        header: "نوع",
        enableSorting: false,
        meta: {
          label: "نوع",
          filterOptions: [
            { value: "manual", label: "دستی" },
            { value: "daily", label: "روزانه" },
            { value: "pre-restore", label: "پیش از بازیابی" },
            { value: "uploaded", label: "بارگذاری‌شده" },
            { value: "pre-switch", label: "پیش از تغییر پایگاه داده" },
          ],
          exportValue: (b) => b.kind_label,
        },
        cell: (c) => <StatusBadge tone={TONES[c.getValue()] ?? "neutral"}>{c.row.original.kind_label}</StatusBadge>,
      }),
      col.accessor("size", {
        header: "حجم",
        meta: { label: "حجم", align: "end" },
        cell: (c) => <span className="tabular-nums">{formatFileSize(c.getValue())}</span>,
      }),
      col.accessor("created_by", { header: "ایجادکننده", enableSorting: false, meta: { label: "ایجادکننده" }, cell: (c) => c.getValue() || "زمان‌بند" }),
      col.accessor("version", {
        header: "نسخه",
        enableSorting: false,
        meta: { label: "نسخه" },
        cell: (c) => <span className="tabular-nums">{toFaDigits(c.getValue())}</span>,
      }),
      actionsColumn<Backup>((b) => (
        <>
          <DropdownMenuItem asChild>
            <a href={`/api/backups/${b.name}/download/`} download>
              <Download /> دانلود
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRestoring(b)}>
            <ArchiveRestore /> بازیابی
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(b)}>
            <Trash2 /> حذف
          </DropdownMenuItem>
        </>
      )),
    ],
    [setRestoring, setDeleting],
  )
  const view = useTableView("backups", { defaultSort: "-created_at" })
  const table = useDataTable({ view, columns, data: backups.data ?? EMPTY, getRowId: (b) => b.name })
  const s = schedule.data

  return (
    <>
      <PageHeader
        title="پشتیبان‌گیری"
        description="پشتیبان کامل شامل همه‌ی اطلاعات و فایل‌های سامانه است. فایل‌ها را گاهی روی دیسک یا رایانه‌ی دیگری هم نگه دارید تا با خرابی دیسک این سرور از دست نروند."
        meta={
          s &&
          (s.daily
            ? `پشتیبان خودکار: هر روز ساعت ${toFaDigits(s.daily_time)} · نگهداری ${formatNumber(s.keep)} نسخه‌ی روزانه‌ی آخر`
            : "پشتیبان خودکار روزانه خاموش است.")
        }
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          <>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <DatabaseBackup />}
              {create.isPending ? "در حال پشتیبان‌گیری…" : "پشتیبان‌گیری اکنون"}
            </Button>
            <Button variant="outline" onClick={() => setUploading(true)}>
              <Upload /> بازیابی از فایل
            </Button>
            {can("settings.manage") && (
              <Button variant="ghost" asChild>
                <Link to="/admin/settings?section=backup">
                  <Settings /> زمان‌بندی
                </Link>
              </Button>
            )}
          </>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="فایل‌های پشتیبان"
        loading={backups.isPending}
        error={backups.error}
        onRetry={() => backups.refetch()}
        exportFileName="پشتیبان‌ها"
        empty={{ title: "هنوز پشتیبانی گرفته نشده است", description: "با «پشتیبان‌گیری اکنون» اولین پشتیبان را بسازید." }}
      />

      {restoring && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRestoring(null)}
          title={`بازیابی از پشتیبان ${formatDateTime(restoring.created_at)}؟`}
          description="همه‌ی اطلاعات و فایل‌های فعلی با محتوای این پشتیبان جایگزین می‌شود و تغییرهای پس از آن از بین می‌رود. پیش از بازیابی، از وضع فعلی خودکار پشتیبان گرفته می‌شود."
          confirmLabel="بازیابی"
          destructive
          requireText={confirmText}
          onConfirm={() => restore.mutateAsync(restoring)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="پشتیبان حذف شود؟"
          description={`پشتیبان ${formatDateTime(deleting.created_at)} برای همیشه حذف می‌شود.`}
          confirmLabel="حذف"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
      <UploadRestoreDialog open={uploading} onOpenChange={setUploading} confirmText={confirmText} onRestored={setRestored} />
      {restored && <RestoredDialog result={restored} />}
    </>
  )
}
