import * as React from "react"
import { Download, Eye, Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import type { StoredFile } from "@/lib/files"
import { formatDateTime, formatFileSize } from "@/lib/format"
import { FileIcon } from "./file-icon"
import { FilePreviewDialog } from "./file-preview-dialog"

type Props = {
  files: StoredFile[]
  /** حذف پیوست؛ بدون آن دکمه‌ی حذف نمایش داده نمی‌شود. */
  onRemove?: (file: StoredFile) => Promise<unknown>
  emptyText?: string
}

/** فهرست پیوست‌ها: نام، حجم و زمان، پیش‌نمایش تصویر و PDF، دانلود و حذف با تأیید. */
export function AttachmentList({ files, onRemove, emptyText = "پیوستی ثبت نشده است." }: Props) {
  const [preview, setPreview] = React.useState<StoredFile | null>(null)
  const [removing, setRemoving] = React.useState<StoredFile | null>(null)

  if (files.length === 0) return <p className="text-xs text-muted-foreground">{emptyText}</p>
  return (
    <>
      <ul aria-label="پیوست‌ها" className="flex flex-col divide-y rounded-md border">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
            <FileIcon name={f.name} />
            <div className="flex min-w-0 flex-1 flex-col">
              <a href={f.url} download className="truncate font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40" dir="auto">
                {f.name}
              </a>
              <span className="text-2xs text-muted-foreground">
                {formatFileSize(f.size)} · {formatDateTime(f.uploaded_at)}
              </span>
            </div>
            {f.previewable && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`پیش‌نمایش ${f.name}`} onClick={() => setPreview(f)}>
                <Eye />
              </Button>
            )}
            <Button asChild variant="ghost" size="icon-sm">
              <a href={f.url} download aria-label={`دانلود ${f.name}`}>
                <Download />
              </a>
            </Button>
            {onRemove && (
              <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" aria-label={`حذف ${f.name}`} onClick={() => setRemoving(f)}>
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <FilePreviewDialog file={preview} onOpenChange={(o) => !o && setPreview(null)} />
      {removing && onRemove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`«${removing.name}» حذف شود؟`}
          description="فایل برای همیشه حذف می‌شود."
          confirmLabel="حذف"
          destructive
          onConfirm={() => onRemove(removing)}
        />
      )}
    </>
  )
}
