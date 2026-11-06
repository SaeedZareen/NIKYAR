import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FileUp } from "lucide-react"
import { toast } from "sonner"
import { CALENDAR_KEY } from "@/app/work-calendar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber } from "@/lib/format"

type Result = Schemas["ImportResult"]

/** ورود تعطیلات از فایل CSV اکسل (تاریخ شمسی، عنوان، نوع اختیاری) با گزارش خطای هر سطر. */
export function ImportHolidays() {
  const qc = useQueryClient()
  const input = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)
  const upload = useMutation({
    mutationFn: (file: File) =>
      unwrap(
        api.POST("/api/calendar/holidays/import/", {
          body: { file: file as unknown as string },
          bodySerializer: (body) => {
            const data = new FormData()
            data.append("file", body.file as unknown as File)
            return data
          },
        })
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: CALENDAR_KEY })
      setResult(r)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const close = (o: boolean) => {
    setOpen(o)
    if (!o) setResult(null)
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileUp /> ورود از فایل
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ورود تعطیلات از فایل</DialogTitle>
            <DialogDescription className="text-2xs">
              در اکسل سه ستون بسازید: تاریخ شمسی (مثل ۱۴۰۷/۰۱/۰۱)، عنوان، و در صورت نیاز نوع («رسمی» یا «خاص سازمان»؛ پیش‌فرض رسمی). سپس با قالب «CSV UTF-8»
              ذخیره کنید. روزی که از قبل ثبت شده با عنوان تازه به‌روز می‌شود.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <Alert variant={result.errors.length ? "destructive" : "default"} role="status">
              <AlertTitle>
                {formatNumber(result.created)} روز اضافه و {formatNumber(result.updated)} روز به‌روز شد.
              </AlertTitle>
              {result.errors.length > 0 && (
                <AlertDescription>
                  <ul className="list-disc ps-4">
                    {result.errors.map((e) => (
                      <li key={e.line}>
                        سطر {formatNumber(e.line)}: {e.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}
          <input
            ref={input}
            type="file"
            hidden
            accept=".csv,text/csv"
            aria-label="فایل CSV تعطیلات"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
              e.target.value = ""
            }}
          />
          <DialogFooter>
            <Button disabled={upload.isPending} onClick={() => input.current?.click()}>
              {upload.isPending ? <Spinner /> : <FileUp />}
              {upload.isPending ? "در حال ورود…" : "انتخاب فایل CSV"}
            </Button>
            <Button variant="ghost" onClick={() => close(false)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
