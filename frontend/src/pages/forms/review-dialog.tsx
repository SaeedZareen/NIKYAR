import { Send } from "lucide-react"
import { toPayload, type FormDefinition, type FormValues } from "@/components/form-renderer/definition"
import { applyRules } from "@/components/form-renderer/rules"
import { FormSummary } from "@/components/form-renderer/value-view"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

/** مرور اطلاعات واردشده پیش از ثبت نهایی؛ «بازگشت و ویرایش» به فرم برمی‌گرداند و «تأیید و ثبت» ارسال می‌کند. */
export function ReviewDialog({ title, definition, values, confirmLabel, submitting, onConfirm, onCancel }: {
  title: string
  definition: FormDefinition
  values: FormValues
  confirmLabel: string
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { values: data, state } = applyRules(definition, toPayload(definition, values))
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onCancel()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>مرور و تأیید نهایی</DialogTitle>
          <DialogDescription>اطلاعات «{title}» را بررسی کنید؛ اگر درست است «{confirmLabel}» را بزنید.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-3">
          <FormSummary definition={definition} data={data} rules={state} title={title} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onCancel}>
            بازگشت و ویرایش
          </Button>
          <Button disabled={submitting} onClick={onConfirm}>
            {submitting ? <Spinner /> : <Send />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
