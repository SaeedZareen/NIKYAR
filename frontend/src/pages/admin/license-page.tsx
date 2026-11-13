import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy, Upload } from "lucide-react"
import { toast } from "sonner"
import { LICENSE_KEY, useLicense } from "@/app/license"
import { DescriptionList } from "@/components/description-list"
import { FilePicker } from "@/components/files"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { formatDate, formatNumber } from "@/lib/format"

/** «ماژول‌ها و لایسنس»: وضعیت اعتبار، کاربران، ماژول‌ها، شناسه‌ی نصب و بارگذاری فایل لایسنس. */
export default function LicensePage() {
  const qc = useQueryClient()
  const license = useLicense()
  const [file, setFile] = React.useState<File | null>(null)
  const fileId = React.useId()
  const upload = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/license/", {
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const data = new FormData()
            data.append("file", file!)
            return data
          },
        })
      ),
    onSuccess: (s) => {
      qc.setQueryData(LICENSE_KEY, s)
      setFile(null)
      toast.success(`لایسنس ${s.org_name} برای ${formatNumber(s.max_users)} کاربر تا ${formatDate(s.expires_on, "long")} فعال شد.`)
    },
  })
  const s = license.data

  return (
    <>
      <PageHeader
        title="ماژول‌ها و لایسنس"
        description="لایسنس را صادرکننده‌ی نیک‌یار برای «شناسه‌ی نصب» همین سرور صادر می‌کند؛ سقف کاربران فعال، ماژول‌ها و تاریخ اعتبار در آن است. پس از پایان اعتبار، اطلاعات محفوظ می‌ماند و فقط مشاهده ممکن است."
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
      />
      {s ? (
        <>
          {s.problems.map((p) => (
            <Alert key={p} variant="destructive">
              <AlertTitle>لایسنس ذخیره‌شده پذیرفته نشد؛ سامانه با دوره‌ی آزمایشی کار می‌کند.</AlertTitle>
              <AlertDescription>{p}</AlertDescription>
            </Alert>
          ))}
          <Section
            title="وضعیت"
            meta={
              <StatusBadge tone={s.expired ? "warning" : s.kind === "trial" ? "info" : "success"}>
                {s.expired ? "منقضی؛ فقط مشاهده" : s.kind === "trial" ? "نسخه‌ی آزمایشی" : "فعال"}
              </StatusBadge>
            }
          >
            <DescriptionList
              items={[
                { label: "نوع", value: s.kind === "trial" ? "آزمایشی (۳۰ روزه)" : "لایسنس" },
                { label: "سازمان", value: s.org_name || null },
                { label: "اعتبار تا", value: `${formatDate(s.expires_on, "long")} (${s.expired ? "گذشته" : `${formatNumber(s.days_left + 1)} روز مانده`})` },
                {
                  label: "کاربران فعال",
                  value: (
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {formatNumber(s.active_users)} از {formatNumber(s.max_users)}
                      </span>
                      <Progress value={Math.min(100, (s.active_users / s.max_users) * 100)} className="max-w-40" aria-label="سهم کاربران فعال از سقف لایسنس" />
                    </span>
                  ),
                },
                {
                  label: "شناسه‌ی نصب",
                  value: (
                    <span className="flex items-center gap-2">
                      <bdi dir="ltr" className="font-semibold tracking-wide">
                        {s.install_id}
                      </bdi>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="کپی شناسه‌ی نصب"
                        onClick={() => navigator.clipboard?.writeText(s.install_id).then(() => toast.success("شناسه‌ی نصب کپی شد."))}
                      >
                        <Copy />
                      </Button>
                    </span>
                  ),
                },
                { label: "شماره‌ی لایسنس", value: s.license_id ? <bdi dir="ltr">{s.license_id}</bdi> : null },
              ]}
            />
          </Section>
          <Section title="ماژول‌ها" description="هسته‌ی سامانه (کاربران، ساختار سازمانی، اعلان‌ها، پشتیبان‌گیری و…) همیشه فعال است؛ ماژول‌ها جداگانه در لایسنس فعال می‌شوند.">
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {s.modules.map((m) => (
                <li key={m.code} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                  <span className="flex-1 font-medium">{m.title}</span>
                  <StatusBadge tone={m.enabled ? "success" : "neutral"}>{m.enabled ? "فعال" : "غیرفعال"}</StatusBadge>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="بارگذاری لایسنس" description="فایل ‎.nikyar-license را که صادرکننده فرستاده انتخاب کنید؛ امضای آن بررسی و همان لحظه فعال می‌شود.">
            <div className="flex flex-col gap-3">
              {upload.error && (
                <Alert variant="destructive">
                  <AlertTitle>{errorMessage(upload.error)}</AlertTitle>
                </Alert>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                  <Label htmlFor={fileId}>فایل لایسنس</Label>
                  <FilePicker id={fileId} value={file} onChange={setFile} accept=".nikyar-license,.json,.txt" label="انتخاب فایل لایسنس" />
                </div>
                <Button disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
                  {upload.isPending ? <Spinner /> : <Upload />} فعال‌سازی لایسنس
                </Button>
              </div>
            </div>
          </Section>
        </>
      ) : (
        <div role="status" aria-label="در حال بارگذاری" className="flex flex-col gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
      )}
    </>
  )
}

