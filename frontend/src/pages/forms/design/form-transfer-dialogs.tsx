import * as React from "react"
import { useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { DESIGN_FORMS_KEY } from "@/app/forms"
import { FilePicker } from "@/components/files"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, csrfToken, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber } from "@/lib/format"

type DesignForm = Schemas["Form"]

/** پس از ساخت فرم از الگو یا فایل: فهرست تازه و رفتن به طراح. */
function useCreated() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return (form: DesignForm) => {
    qc.invalidateQueries({ queryKey: DESIGN_FORMS_KEY })
    toast.success(`فرم «${form.title}» ساخته شد؛ پس از بررسی، آن را منتشر کنید.`)
    navigate(`/forms/design/${form.id}`)
  }
}

/** «فرم جدید از الگو»: فرم‌های اداری آماده که پس از ساخت آزادانه تغییر می‌کنند. */
export function TemplatesDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const created = useCreated()
  const templates = useQuery({ queryKey: [...DESIGN_FORMS_KEY, "templates"], queryFn: () => unwrap(api.GET("/api/forms/templates/")), staleTime: Infinity })
  const create = useMutation({
    mutationFn: (key: string) => unwrap(api.POST("/api/forms/templates/{key}/", { params: { path: { key } } })),
    onSuccess: created,
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>فرم جدید از الگو</DialogTitle>
          <DialogDescription>فرم ساخته‌شده پیش‌نویس است؛ پیش از انتشار هر چه بخواهید تغییرش دهید.</DialogDescription>
        </DialogHeader>
        {templates.isPending && <Spinner />}
        {templates.error && <p className="text-xs text-destructive">{errorMessage(templates.error)}</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.data?.map((t) => (
            <li key={t.key} className="flex flex-col gap-1.5 rounded-md border p-3">
              <span className="text-xs font-semibold">{t.title}</span>
              <span className="flex-1 text-2xs text-muted-foreground">{t.description}</span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs text-muted-foreground">{formatNumber(t.field_count)} فیلد</span>
                <Button size="sm" disabled={create.isPending} onClick={() => create.mutate(t.key)} aria-label={`ساخت فرم از الگوی «${t.title}»`}>
                  {create.isPending && create.variables === t.key ? <Spinner /> : null} ساخت
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/** «ورود فرم»: ساخت فرم تازه از فایلی که با «خروجی فرم» (در همین یا نصب دیگر نیک‌یار) ساخته شده است. */
export function ImportDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const created = useCreated()
  const [file, setFile] = React.useState<File | null>(null)
  const upload = useMutation({
    mutationFn: async (f: File) => {
      const body = new FormData()
      body.append("file", f)
      const r = await fetch("/api/forms/import/", { method: "POST", headers: { "X-CSRFToken": csrfToken() }, body })
      const data = await r.json().catch(() => ({}))
      if (r.status !== 201) throw new ApiError(r.status, data.fields?.file ?? data.detail ?? "ورود فرم ناموفق بود.", data.code, data.fields)
      return data as DesignForm
    },
    onSuccess: created,
  })
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ورود فرم</DialogTitle>
          <DialogDescription>فایلی را انتخاب کنید که با «خروجی فرم» ساخته شده است. فرم تازه پیش‌نویس است و دسترسی‌هایش را باید در «تنظیمات» تعیین کنید.</DialogDescription>
        </DialogHeader>
        <FilePicker id="import-file" accept=".json,application/json" value={file} onChange={setFile} label="انتخاب فایل فرم" />
        {upload.error && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(upload.error)}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button disabled={!file || upload.isPending} onClick={() => file && upload.mutate(file)}>
            {upload.isPending && <Spinner />} ورود فرم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
