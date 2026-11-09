import * as React from "react"
import { Link } from "react-router"
import { StatusBadge } from "@/components/status-badge"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, FileText, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { SUBMISSIONS_KEY } from "@/app/forms"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { InfoTip } from "@/components/info-tip"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"

type Draft = Schemas["FormSubmission"]
type AvailableForm = Schemas["AvailableForm"]
const col = columnHelper<Draft>()
const EMPTY: Draft[] = []
const draftUrl = (d: Draft) => `/forms/${d.form}/fill?draft=${d.id}`

/** «فرم‌ها»: فرم‌هایی که کاربر اجازه‌ی پر کردنشان را دارد (به تفکیک دسته) و پیش‌نویس‌های نیمه‌کاره‌اش. */
export default function FormsPage() {
  const forms = useQuery({ queryKey: ["forms", "available"], queryFn: () => unwrap(api.GET("/api/forms/available/")) })
  const drafts = useQuery({
    queryKey: [...SUBMISSIONS_KEY, "my-drafts"],
    queryFn: () => unwrap(api.GET("/api/forms/submissions/", { params: { query: { mine: true, status: "draft", page_size: 100 } } })),
  })
  const groups = React.useMemo(() => {
    const map = new Map<string, AvailableForm[]>()
    for (const f of forms.data ?? []) map.set(f.category_title || "سایر فرم‌ها", [...(map.get(f.category_title || "سایر فرم‌ها") ?? []), f])
    return [...map.entries()]
  }, [forms.data])
  const draftRows = drafts.data?.results ?? EMPTY

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="فرم‌ها" description="فرم‌هایی که اجازه‌ی پر کردنشان را دارید. هنگام پر کردن، پیش‌نویس خودکار ذخیره می‌شود و بعداً از همین صفحه ادامه می‌دهید." />
      {draftRows.length > 0 && (
        <Section title="پیش‌نویس‌های من" meta={`${formatNumber(draftRows.length)} پیش‌نویس`}>
          <DraftsTable rows={draftRows} loading={drafts.isPending} error={drafts.error} onRetry={() => drafts.refetch()} />
        </Section>
      )}
      {forms.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : groups.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>فرمی برای پر کردن ندارید</EmptyTitle>
            <EmptyDescription>{forms.error ? errorMessage(forms.error) : "فرم‌هایی که سازمان منتشر کند و اجازه‌ی پر کردنشان را داشته باشید، اینجا می‌آیند."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map(([category, items]) => (
          <Section key={category} title={category} meta={`${formatNumber(items.length)} فرم`}>
            <ul className="@container grid gap-2 @2xl:grid-cols-2 @6xl:grid-cols-3" aria-label={`فرم‌های ${category}`}>
              {items.map((f) => (
                <li key={f.id} className="flex items-center gap-1 rounded-md border px-3 py-2 hover:bg-muted/50">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <Link to={`/forms/${f.id}/fill`} className="min-w-0 flex-1 truncate py-0.5 text-xs font-medium hover:underline">
                    {f.title}
                  </Link>
                  {f.description && <InfoTip label={`راهنمای ${f.title}`}>{f.description}</InfoTip>}
                  {f.availability.code !== "open" ? (
                    <StatusBadge tone={f.availability.code === "limit" ? "success" : "neutral"} className="shrink-0">
                      <span title={f.availability.message}>{CLOSED[f.availability.code]}</span>
                    </StatusBadge>
                  ) : (
                    f.availability.remaining !== null && <span className="shrink-0 text-2xs text-muted-foreground">ظرفیت: {formatNumber(f.availability.remaining)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </div>
  )
}

/** وضعیت فرمی که اکنون ثبت نمی‌پذیرد (شرح کامل در صفحه‌ی خود فرم). */
const CLOSED: Record<string, string> = { not_yet: "هنوز باز نشده", closed: "بسته", full: "تکمیل ظرفیت", limit: "پر کرده‌اید" }

function DraftsTable({ rows, loading, error, onRetry }: { rows: Draft[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const qc = useQueryClient()
  const [deleting, setDeleting] = React.useState<Draft | null>(null)
  const remove = useMutation({
    mutationFn: (d: Draft) => unwrap(api.DELETE("/api/forms/submissions/{id}/", { params: { path: { id: d.id } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMISSIONS_KEY })
      toast.success("پیش‌نویس حذف شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const columns = React.useMemo<DataTableColumn<Draft>[]>(
    () => [
      col.accessor("form_title", { header: "فرم", meta: { label: "فرم", primary: true } }),
      col.accessor("updated_at", {
        header: "آخرین تغییر",
        meta: { label: "آخرین تغییر" },
        cell: (c) => <span className="tabular-nums">{formatDateTime(c.getValue())}</span>,
      }),
      actionsColumn<Draft>((d) => (
        <>
          <DropdownMenuItem asChild>
            <Link to={draftUrl(d)}>
              <Pencil /> ادامه‌ی پر کردن
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(d)}>
            <Trash2 /> حذف پیش‌نویس
          </DropdownMenuItem>
        </>
      )),
    ],
    []
  )
  const view = useTableView("form-drafts", { urlKey: "drafts.", defaultSort: "-updated_at" })
  const table = useDataTable({ view, columns, data: rows, getRowId: (d) => String(d.id) })
  return (
    <>
      <DataTable
        table={table}
        view={view}
        caption="پیش‌نویس‌های من"
        loading={loading}
        error={error}
        onRetry={onRetry}
        rowHref={draftUrl}
        exportFileName="پیش‌نویس‌ها"
        empty={{ title: "پیش‌نویسی ندارید" }}
        compact
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="حذف پیش‌نویس"
          description={`پیش‌نویس «${deleting.form_title}» و فایل‌های پیوست آن حذف می‌شود.`}
          confirmLabel="حذف پیش‌نویس"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </>
  )
}
