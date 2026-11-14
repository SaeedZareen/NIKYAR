import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { SESSION_KEY, useLogout } from "@/app/auth"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { lastInput, markInput } from "@/lib/activity"
import { toFaDigits } from "@/lib/format"

const WARN_SECONDS = 60

/**
 * «پایان نشست پس از بی‌کاری»: یک دقیقه پیش از پایان، پنجره‌ی هشدار با شمارش معکوس؛ «ادامه‌ی کار» نشست را تمدید
 * می‌کند و در پایان، خروج و رفتن به صفحه‌ی ورود. بی‌کاری از همه‌ی زبانه‌ها حساب می‌شود؛ سرور هم جداگانه می‌سنجد.
 */
export function IdleGuard({ minutes }: { minutes: number }) {
  const [left, setLeft] = React.useState<number | null>(null)
  const logout = useLogout()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const logoutRef = React.useRef(logout.mutate)
  React.useEffect(() => {
    logoutRef.current = logout.mutate
  })

  React.useEffect(() => {
    if (!minutes) return
    const tick = () => {
      const remaining = Math.ceil((lastInput() + minutes * 60_000 - Date.now()) / 1000)
      if (remaining <= 0) {
        const next = window.location.pathname + window.location.search
        logoutRef.current(undefined, { onSettled: () => navigate(`/login?reason=idle&next=${encodeURIComponent(next)}`, { replace: true }) })
        setLeft(null)
        return
      }
      setLeft(remaining <= WARN_SECONDS ? remaining : null)
    }
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [minutes, navigate])

  const stay = () => {
    markInput()
    setLeft(null)
    // یک درخواست با بی‌کاری صفر تا سرور هم نشست را تمدید کند
    qc.invalidateQueries({ queryKey: SESSION_KEY })
  }

  return (
    <AlertDialog open={left !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>به دلیل بی‌کاری از سامانه خارج می‌شوید</AlertDialogTitle>
          <AlertDialogDescription>
            اگر کاری انجام ندهید، تا <span className="font-semibold tabular-nums">{toFaDigits(left ?? 0)}</span> ثانیه‌ی دیگر خارج می‌شوید. کارهای ذخیره‌نشده از دست می‌روند.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={stay}>ادامه‌ی کار</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
