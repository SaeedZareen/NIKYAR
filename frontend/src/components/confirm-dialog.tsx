import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  /** برای کارهای بسیار پرخطر (مثل بازیابی): کاربر باید دقیقاً این متن را بنویسد تا دکمه فعال شود. */
  requireText?: string
  /** عمل تأییدشده؛ پنجره تا پایان آن باز می‌ماند و پس از موفقیت بسته می‌شود. */
  onConfirm: () => Promise<unknown>
}

/** پنجره‌ی تأیید برای کارهای برگشت‌ناپذیر (حذف، غیرفعال‌کردن، پایان انتصاب). */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, requireText, onConfirm }: Props) {
  const [pending, setPending] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const inputId = React.useId()
  const blocked = requireText !== undefined && typed.trim() !== requireText
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireText !== undefined && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId} className="font-normal">
              برای تأیید، «{requireText}» را بنویسید:
            </Label>
            <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={pending} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>انصراف</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending || blocked}
            onClick={async (e) => {
              e.preventDefault()
              setPending(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setPending(false)
              }
            }}
          >
            {pending && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
