import { Link } from "react-router"
import { ShieldAlert } from "lucide-react"
import { useAuth } from "@/app/auth"
import { useLicense } from "@/app/license"
import { formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * نوار وضعیت لایسنس بالای هر صفحه: پس از انقضا برای همه (سامانه فقط‌خواندنی است)؛
 * دوره‌ی آزمایشی و ۳۰ روز آخر اعتبار فقط برای مدیر لایسنس، با پیوند به صفحه‌ی لایسنس.
 */
export function LicenseBanner() {
  const { can } = useAuth()
  const license = useLicense().data
  const manager = can("license.manage")
  if (!license || !(license.expired || (license.warn && manager))) return null

  const text = license.expired
    ? `اعتبار ${license.kind === "trial" ? "دوره‌ی آزمایشی" : "لایسنس"} در ${formatDate(license.expires_on, "long")} تمام شده است؛ اطلاعات محفوظ است ولی فقط مشاهده ممکن است.`
    : license.kind === "trial"
      ? `نسخه‌ی آزمایشی: ${formatNumber(license.days_left + 1)} روز مانده (تا ${formatDate(license.expires_on, "long")}).`
      : `${formatNumber(license.days_left + 1)} روز تا پایان اعتبار لایسنس (${formatDate(license.expires_on, "long")}) مانده است.`

  return (
    <div
      role={license.expired ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs",
        license.expired ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-foreground"
      )}
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{text}</span>
      {manager ? (
        <Link to="/admin/license" className="font-semibold underline underline-offset-2">
          {license.expired ? "بارگذاری لایسنس تازه" : "ماژول‌ها و لایسنس"}
        </Link>
      ) : (
        <span className="text-2xs">برای تمدید با راهبر سامانه تماس بگیرید.</span>
      )}
    </div>
  )
}
