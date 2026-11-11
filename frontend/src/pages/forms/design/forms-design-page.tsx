import * as React from "react"
import { Link, useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, FileDown, FileSpreadsheet, FileUp, LayoutTemplate, PencilRuler, Plus, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DESIGN_FORMS_KEY } from "@/app/forms"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView } from "@/components/data-table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber, toFaDigits } from "@/lib/format"
import { FormSettingsSheet } from "./form-settings-sheet"
import { ImportDialog, TemplatesDialog } from "./form-transfer-dialogs"

type DesignForm = Schemas["Form"]
const EMPTY: DesignForm[] = []
const col = columnHelper<DesignForm>()

function statusOf(f: DesignForm) {
  if (!f.is_active) return { label: "غیرفعال", tone: "neutral" as const }
  if (f.published_version === null) return { label: "منتشرنشده", tone: "warning" as const }
  return { label: f.draft_version ? `نسخه‌ی ${toFaDigits(f.published_version)} · پیش‌نویس باز` : `نسخه‌ی ${toFaDigits(f.published_version)}`, tone: "success" as const }
}

/** «طراحی فرم‌ها»: فهرست فرم‌ها برای طراحان، فرم جدید (خالی، از الگو یا از فایل)، تنظیمات، کپی، خروجی و حذف. */
export default function FormsDesignPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const view = useTableView("forms-design", { defaultSort: "title" })
  const forms = useQuery({ queryKey: [...DESIGN_FORMS_KEY, "list"], queryFn: () => unwrap(api.GET("/api/forms/", { params: { query: { page_size: 100 } } })) })
  const [editing, setEditing] = React.useState<{ form: DesignForm | null } | null>(null)
  const [deleting, setDeleting] = React.useState<DesignForm | null>(null)
  const [dialog, setDialog] = React.useState<"templates" | "import" | null>(null)

  const remove = useMutation({
    mutationFn: (f: DesignForm) => unwrap(api.DELETE("/api/forms/{id}/", { params: { path: { id: String(f.id) } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESIGN_FORMS_KEY })
      toast.success("فرم حذف شد.")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  // کپی: فرم تازه با تعریف آخرین نسخه‌ی فرم مبدأ (پیش‌نویس اگر هست، وگرنه منتشرشده).
  const copy = useMutation({
    mutationFn: async (f: DesignForm) => {
      const versions = await unwrap(api.GET("/api/forms/versions/", { params: { query: { form: String(f.id) } } }))
      const source = await unwrap(api.GET("/api/forms/versions/{id}/", { params: { path: { id: versions[0].id } } }))
      const code = `${f.code.slice(0, 28)}-${Date.now().toString(36)}`.slice(0, 40)
      const created = await unwrap(api.POST("/api/forms/", { body: { code, title: `کپی ${f.title}`.slice(0, 150), description: f.description, category: f.category, fill_by_everyone: f.fill_by_everyone } }))
      await unwrap(api.PATCH("/api/forms/versions/{id}/", { params: { path: { id: created.draft_version as number } }, body: { definition: source.definition } }))
      return created
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: DESIGN_FORMS_KEY })
      toast.success(`فرم «${created.title}» ساخته شد.`)
      navigate(`/forms/design/${created.id}`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns = React.useMemo(
    () => [
      col.accessor("title", { header: "عنوان", meta: { label: "عنوان", primary: true } }),
      col.accessor("code", { header: "شناسه", meta: { label: "شناسه" }, cell: (c) => <span dir="ltr">{c.getValue()}</span> }),
      col.accessor("category_title", { header: "دسته", meta: { label: "دسته" }, cell: (c) => c.getValue() || "—" }),
      col.accessor((f) => statusOf(f).label, {
        id: "status",
        header: "وضعیت",
        enableSorting: false,
        meta: { label: "وضعیت" },
        cell: (c) => <StatusBadge tone={statusOf(c.row.original).tone}>{c.getValue()}</StatusBadge>,
      }),
      col.accessor("submission_count", {
        header: "ثبت‌ها",
        sortFn: "basic",
        meta: { label: "ثبت‌ها", align: "end" as const },
        cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span>,
      }),
      actionsColumn<DesignForm>((f) => (
        <>
          <DropdownMenuItem asChild>
            <Link to={`/forms/design/${f.id}`}>
              <PencilRuler /> طراحی
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/forms/reports/${f.id}`}>
              <FileSpreadsheet /> ثبت‌ها
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing({ form: f })}>
            <Settings2 /> تنظیمات
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy.mutate(f)}>
            <Copy /> کپی
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/forms/${f.id}/export/`} download>
              <FileDown /> خروجی فرم
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(f)}>
            <Trash2 /> حذف
          </DropdownMenuItem>
        </>
      )),
    ],
    [copy]
  )
  const table = useDataTable({ view, columns, data: forms.data?.results ?? EMPTY, getRowId: (f) => String(f.id) })

  return (
    <>
      <PageHeader
        title="طراحی فرم‌ها"
        description="فرم‌های سازمان را بدون کدنویسی بسازید، منتشر کنید و تعیین کنید چه کسانی پر کنند."
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog("import")}>
              <FileUp /> ورود فرم
            </Button>
            <Button variant="outline" onClick={() => setDialog("templates")}>
              <LayoutTemplate /> فرم جدید از الگو
            </Button>
            <Button onClick={() => setEditing({ form: null })}>
              <Plus /> فرم جدید
            </Button>
          </>
        }
      />
      <DataTable
        table={table}
        view={view}
        caption="فرم‌های سازمان"
        loading={forms.isPending}
        error={forms.error}
        onRetry={() => forms.refetch()}
        rowHref={(f) => `/forms/design/${f.id}`}
        searchPlaceholder="عنوان یا شناسه‌ی فرم"
        exportFileName="فرم‌ها"
        empty={{ title: "هنوز فرمی ساخته نشده است", description: "با «فرم جدید» اولین فرم سازمان را بسازید." }}
      />
      {editing && <FormSettingsSheet key={editing.form?.id ?? "new"} form={editing.form} open onOpenChange={(o) => !o && setEditing(null)} />}
      {dialog === "templates" && <TemplatesDialog onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "import" && <ImportDialog onOpenChange={(o) => !o && setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`فرم «${deleting.title}» حذف شود؟`}
          description="فرمی که ثبت دارد حذف نمی‌شود؛ آن را در تنظیمات غیرفعال کنید."
          confirmLabel="حذف"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
        />
      )}
    </>
  )
}
