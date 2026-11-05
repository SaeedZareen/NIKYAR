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
import { Spinner } from "@/components/ui/spinner"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  /** عمل تأییدشده؛ پنجره تا پایان آن باز می‌ماند و پس از موفقیت بسته می‌شود. */
  onConfirm: () => Promise<unknown>
}

/** پنجره‌ی تأیید برای کارهای برگشت‌ناپذیر (حذف، غیرفعال‌کردن، پایان انتصاب). */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm }: Props) {
  const [pending, setPending] = React.useState(false)
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>انصراف</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
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
