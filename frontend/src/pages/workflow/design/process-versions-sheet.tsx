import * as React from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Columns2, FileDown, FileUp } from "lucide-react"
import { toast } from "sonner"
import { DESIGN_PROCESSES_KEY } from "@/app/workflow"
import { FilePicker } from "@/components/files"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"
import { ProcessCanvas } from "./process-canvas"

type Process = Schemas["Process"]
type Version = Schemas["ProcessVersionDetail"]
const MAX_BPMN = 1024 * 1024

const versionDetail = (id: number) => unwrap(api.GET("/api/workflow/versions/{id}/", { params: { path: { id } } }))

/** نسخه‌های فرایند: خروجی فایل BPMN هر نسخه، نمایش کنار هم با نسخه‌ی باز، و ورود فایل BPMN به پیش‌نویس. */
export function ProcessVersionsSheet({ process, current, open, onOpenChange, onReplaced }: { process: Process; current: Version; open: boolean; onOpenChange: (o: boolean) => void; onReplaced: () => void }) {
  const versions = useQuery({ queryKey: [...DESIGN_PROCESSES_KEY, "versions", String(process.id)], queryFn: () => unwrap(api.GET("/api/workflow/versions/", { params: { query: { process: String(process.id) } } })), enabled: open })
  const [comparing, setComparing] = React.useState<Version | null>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const download = async (id: number, number: number) => {
    const detail = await versionDetail(id)
    const url = URL.createObjectURL(new Blob([detail.bpmn], { type: "application/xml" }))
    Object.assign(document.createElement("a"), { href: url, download: `${process.code}-v${number}.bpmn` }).click()
    URL.revokeObjectURL(url)
  }
  const compare = useMutation({ mutationFn: (id: number) => versionDetail(id), onSuccess: setComparing, onError: (e) => toast.error(errorMessage(e)) })
  const replace = useMutation({
    mutationFn: async (f: File) => {
      if (f.size > MAX_BPMN) throw new Error("فایل فرایند بیش از یک مگابایت است.")
      return unwrap(api.PATCH("/api/workflow/versions/{id}/", { params: { path: { id: current.id } }, body: { bpmn: await f.text() } }))
    },
    onSuccess: () => {
      toast.success("فایل BPMN جایگزین پیش‌نویس شد.")
      setFile(null)
      onOpenChange(false)
      onReplaced()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>نسخه‌ها</SheetTitle>
            <SheetDescription>هر نسخه‌ی منتشرشده تغییرناپذیر است و درخواست‌ها با نسخه‌ی خودشان تمام می‌شوند.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <ul className="flex flex-col gap-2" aria-label="نسخه‌های فرایند">
              {(versions.data ?? []).map((v) => (
                <li key={v.id} className="flex flex-col gap-1.5 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">نسخه‌ی {toFaDigits(v.number)}</span>
                    <StatusBadge tone={v.status === "draft" ? "warning" : "success"}>{v.status === "draft" ? "پیش‌نویس" : "منتشرشده"}</StatusBadge>
                  </div>
                  {v.published_at && (
                    <span className="text-2xs text-muted-foreground">
                      انتشار {formatDateTime(v.published_at)}
                      {v.published_by_name && ` · ${v.published_by_name}`}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {v.id !== current.id && (
                      <Button variant="outline" size="sm" disabled={compare.isPending} onClick={() => compare.mutate(v.id)}>
                        <Columns2 /> کنار نسخه‌ی باز
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => download(v.id, v.number)}>
                      <FileDown /> خروجی BPMN
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {current.status === "draft" && (
              <Section title="ورود فایل BPMN" description="فایل BPMN ساخته‌شده با ابزارهای دیگر (یا خروجی همین‌جا) جای نمودار پیش‌نویس را می‌گیرد؛ فقط عنصرهای پشتیبانی‌شده منتشر می‌شوند.">
                <div className="flex flex-col gap-2">
                  <FilePicker id="bpmn-file" value={file} onChange={setFile} accept=".bpmn,.xml" label="انتخاب فایل BPMN" />
                  <Button className="self-start" disabled={!file || replace.isPending} onClick={() => file && replace.mutate(file)}>
                    {replace.isPending ? <Spinner /> : <FileUp />} جایگزینی پیش‌نویس
                  </Button>
                </div>
              </Section>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {comparing && (
        <Dialog open onOpenChange={(o) => !o && setComparing(null)}>
          <DialogContent className="flex max-h-[92svh] flex-col sm:max-w-[min(96vw,90rem)]">
            <DialogHeader>
              <DialogTitle>
                نسخه‌ی {toFaDigits(comparing.number)} کنار نسخه‌ی {toFaDigits(current.number)}
              </DialogTitle>
              <DialogDescription>هر دو فقط برای دیدن‌اند؛ برای تغییر، پیش‌نویس را در فرایندساز ویرایش کنید.</DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              {[comparing, current].map((v) => (
                <figure key={v.id} className="flex flex-col gap-1">
                  <figcaption className="text-xs font-medium">
                    نسخه‌ی {toFaDigits(v.number)} ({v.status === "draft" ? "پیش‌نویس" : "منتشرشده"})
                  </figcaption>
                  <ProcessCanvas xml={v.bpmn} readOnly problems={{}} label={`نمودار نسخه‌ی ${toFaDigits(v.number)}`} className="h-[60svh] rounded-md border" />
                </figure>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
