import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Ban, RotateCcw, Undo2, UserRoundCog } from "lucide-react"
import { toast } from "sonner"
import { REQUESTS_KEY } from "@/app/workflow"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { UserPicker } from "@/components/user-picker"
import { ApiError, api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"

type Track = Schemas["RequestTrack"]
type Kind = "reassign" | "move" | "restart" | "cancel"

const ACTIONS: Record<Kind, { title: string; description: string; done: string }> = {
  reassign: { title: "ارجاع دوباره", description: "گیرنده‌ی کار منتظر عوض می‌شود و کار به کارتابل گیرنده‌ی تازه می‌رود.", done: "کار به گیرنده‌ی تازه ارجاع شد." },
  move: { title: "ارسال به مرحله‌ی گذشته", description: "درخواست به مرحله‌ای که پیش‌تر از آن گذشته برمی‌گردد و کارهای منتظر فعلی لغو می‌شوند.", done: "درخواست به مرحله‌ی انتخاب‌شده برگشت." },
  restart: { title: "شروع دوباره", description: "فرایند با داده‌ی فعلی درخواست از آغاز اجرا می‌شود و کارهای منتظر فعلی لغو می‌شوند. تاریخچه می‌ماند.", done: "درخواست از نو شروع شد." },
  cancel: { title: "لغو درخواست", description: "درخواست لغو و کار آن از کارتابل گیرنده‌ها برداشته می‌شود. این کار بازگشت ندارد.", done: "درخواست لغو شد." },
}

/** کارهای مدیر روی درخواست در جریان؛ هر کدام با دلیل در تاریخچه و سوابق. */
export function ManageSection({ data, queryKey }: { data: Track; queryKey: unknown[] }) {
  const [kind, setKind] = React.useState<Kind | null>(null)
  return (
    <Section title="مدیریت درخواست" description="این بخش را مدیران همین فرایند و دارندگان مجوز «مدیریت همه‌ی درخواست‌ها» می‌بینند.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!data.waiting.length} onClick={() => setKind("reassign")}>
          <UserRoundCog /> ارجاع دوباره
        </Button>
        <Button variant="outline" disabled={!data.steps.length} onClick={() => setKind("move")}>
          <Undo2 /> ارسال به مرحله‌ی گذشته
        </Button>
        <Button variant="outline" onClick={() => setKind("restart")}>
          <RotateCcw /> شروع دوباره
        </Button>
        <Button variant="outline" className="text-destructive" onClick={() => setKind("cancel")}>
          <Ban /> لغو با دلیل
        </Button>
      </div>
      {kind && <ManageDialog kind={kind} data={data} queryKey={queryKey} onClose={() => setKind(null)} />}
    </Section>
  )
}

function ManageDialog({ kind, data, queryKey, onClose }: { kind: Kind; data: Track; queryKey: unknown[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = React.useState("")
  const [task, setTask] = React.useState(String(data.waiting[0]?.id ?? ""))
  const [user, setUser] = React.useState<{ id: number; name: string } | null>(null)
  const [element, setElement] = React.useState(data.steps[0]?.element ?? "")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const action = ACTIONS[kind]
  const run = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/workflow/requests/{id}/manage/", {
          params: { path: { id: data.id } },
          body: { action: kind, reason, task: kind === "reassign" ? Number(task) : undefined, users: kind === "reassign" && user ? [user.id] : undefined, element: kind === "move" ? element : undefined },
        })
      ),
    onSuccess: (next) => {
      qc.setQueryData(queryKey, next)
      qc.invalidateQueries({ queryKey: REQUESTS_KEY })
      toast.success(action.done)
      onClose()
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : toast.error(errorMessage(e))),
  })
  const submit = () => {
    const local: Record<string, string> = {}
    if (!reason.trim()) local.reason = "دلیل این کار در تاریخچه‌ی درخواست ثبت می‌شود."
    if (kind === "reassign" && !user) local.users = "گیرنده‌ی تازه را انتخاب کنید."
    setErrors(local)
    if (!Object.keys(local).length) run.mutate()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !run.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.title}</DialogTitle>
          <DialogDescription>{action.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {kind === "reassign" && (
            <>
              {data.waiting.length > 1 && (
                <Field>
                  <FieldLabel htmlFor="manage-task">کار</FieldLabel>
                  <Select value={task} onValueChange={setTask}>
                    <SelectTrigger id="manage-task" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.waiting.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.title} (نزد {t.candidates.join("، ")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field data-invalid={!!errors.users}>
                <FieldLabel htmlFor="manage-user">گیرنده‌ی تازه</FieldLabel>
                <UserPicker id="manage-user" value={user} onChange={setUser} aria-invalid={!!errors.users} />
                {errors.users && <FieldError>{errors.users}</FieldError>}
              </Field>
            </>
          )}
          {kind === "move" && (
            <Field data-invalid={!!errors.element}>
              <FieldLabel htmlFor="manage-step">مرحله</FieldLabel>
              <Select value={element} onValueChange={setElement}>
                <SelectTrigger id="manage-step" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.steps.map((s) => (
                    <SelectItem key={s.element} value={s.element}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.element && <FieldError>{errors.element}</FieldError>}
            </Field>
          )}
          <Field data-invalid={!!errors.reason}>
            <FieldLabel htmlFor="manage-reason">دلیل</FieldLabel>
            <Textarea id="manage-reason" rows={2} maxLength={500} value={reason} aria-invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
            {errors.reason && <FieldError>{errors.reason}</FieldError>}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>
            انصراف
          </Button>
          <Button variant={kind === "cancel" ? "destructive" : "default"} onClick={submit} disabled={run.isPending}>
            {action.title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
