import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { ArchiveRestore, CircleCheck } from "lucide-react"
import { FilePicker } from "@/components/files"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"

type RestoreResult = Schemas["RestoreResult"]

/** بازیابی از فایل پشتیبانی که روی رایانه‌ی کاربر است (مثلاً پس از نصب دوباره روی سرور تازه). */
export function UploadRestoreDialog({
  open,
  onOpenChange,
  confirmText,
  onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  confirmText: string
  onRestored: (r: RestoreResult) => void
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [typed, setTyped] = React.useState("")
  const fileId = React.useId()
  const confirmId = React.useId()
  const upload = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/backups/upload-restore/", {
          body: { file: file as unknown as string, confirm: typed },
          bodySerializer: () => {
            const data = new FormData()
            data.append("file", file!)
            data.append("confirm", typed)
            return data
          },
        }),
      ),
    onSuccess: (r) => {
      onOpenChange(false)
      onRestored(r)
    },
  })
  const close = (o: boolean) => {
    if (upload.isPending) return
    onOpenChange(o)
    if (!o) {
      setFile(null)
      setTyped("")
      upload.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>بازیابی از فایل پشتیبان</DialogTitle>
          <DialogDescription className="text-2xs">
            همه‌ی اطلاعات و فایل‌های فعلی با محتوای فایل پشتیبان جایگزین می‌شود. پیش از بازیابی، از وضع فعلی خودکار پشتیبان گرفته می‌شود. فقط پشتیبان همین نسخه
            یا نسخه‌های قدیمی‌تر نیک‌یار پذیرفته می‌شود.
          </DialogDescription>
        </DialogHeader>
        {upload.error && (
          <Alert variant="destructive">
            <AlertTitle>{errorMessage(upload.error)}</AlertTitle>
          </Alert>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fileId}>فایل پشتیبان (ZIP)</Label>
            <FilePicker id={fileId} value={file} onChange={setFile} accept=".zip,application/zip" disabled={upload.isPending} label="انتخاب فایل پشتیبان" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={confirmId} className="font-normal">
              برای تأیید، «{confirmText}» را بنویسید:
            </Label>
            <Input id={confirmId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={upload.isPending} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={!file || typed.trim() !== confirmText || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? <Spinner /> : <ArchiveRestore />}
            {upload.isPending ? "در حال بازیابی…" : "بازیابی"}
          </Button>
          <Button variant="ghost" disabled={upload.isPending} onClick={() => close(false)}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** پس از بازیابی، همه‌ی اطلاعات صفحه کهنه است (حتی نشست ورود)؛ صفحه کامل دوباره بارگذاری می‌شود. */
export function RestoredDialog({ result }: { result: RestoreResult }) {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CircleCheck className="size-5 text-success" aria-hidden /> بازیابی انجام شد
          </AlertDialogTitle>
          <AlertDialogDescription>
            اطلاعات سامانه به وضع {formatDateTime(result.restored.created_at)} برگشت. برای دیدن اطلاعات بازیابی‌شده صفحه دوباره بارگذاری می‌شود؛ اگر حساب شما در
            آن زمان وجود نداشته، دوباره وارد شوید.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert>
          <AlertTitle className="text-xs">پشتیبان وضع پیش از بازیابی</AlertTitle>
          <AlertDescription className="text-2xs">
            اگر لازم شد به وضع قبل برگردید، از پشتیبان «پیش از بازیابی» {formatDateTime(result.safety.created_at)} استفاده کنید.
          </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => window.location.assign("/admin/backups")}>بارگذاری دوباره</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
