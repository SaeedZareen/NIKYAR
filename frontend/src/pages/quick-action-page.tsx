import { Link, useParams } from "react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import { CircleCheck, CircleSlash } from "lucide-react"
import { useBranding } from "@/app/branding"
import { BrandMark } from "@/components/layout/brand-mark"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"

/**
 * تأیید با یک کلیک از ایمیل: صفحه‌ی عمومی پیوند یک‌بارمصرف. تصمیم فقط با زدن «ثبت» انجام می‌شود (نه با باز شدن پیوند)،
 * تا پیش‌نمایش خودکار ایمیل چیزی را ثبت نکند.
 */
export default function QuickActionPage() {
  const { token = "" } = useParams()
  const orgName = useBranding().name
  const info = useQuery({ queryKey: ["workflow", "quick", token], queryFn: () => unwrap(api.GET("/api/workflow/quick/{token}/", { params: { path: { token } } })) })
  const use = useMutation({ mutationFn: () => unwrap(api.POST("/api/workflow/quick/{token}/", { params: { path: { token } } })) })
  const data = use.data ?? info.data
  const done = use.isSuccess

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col items-start">
          <BrandMark className="mb-3 size-12 rounded-lg text-xl" />
          {orgName && <p className="mb-1 text-sm font-semibold text-primary">{orgName}</p>}
          <h1 className="text-lg font-bold">ثبت تصمیم از ایمیل</h1>
        </div>
        {info.isPending ? (
          <Spinner />
        ) : info.error || !data ? (
          <Alert variant="destructive">
            <CircleSlash />
            <AlertDescription>{errorMessage(info.error)}</AlertDescription>
          </Alert>
        ) : (
          <>
            {data.step && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border bg-card p-3 text-xs">
                <dt className="text-muted-foreground">درخواست</dt>
                <dd>
                  {data.process_title}
                  {data.number && <span className="tabular-nums"> · شماره‌ی {toFaDigits(data.number)}</span>}
                </dd>
                <dt className="text-muted-foreground">درخواست‌دهنده</dt>
                <dd>{data.requester_name}</dd>
                <dt className="text-muted-foreground">مرحله</dt>
                <dd>{data.step}</dd>
                <dt className="text-muted-foreground">گیرنده</dt>
                <dd>{data.user_name}</dd>
                <dt className="text-muted-foreground">تصمیم</dt>
                <dd className="font-semibold">{data.decision_label}</dd>
              </dl>
            )}
            {done ? (
              <Alert>
                <CircleCheck className="text-success" />
                <AlertDescription>«{data.decision_label}» برای «{data.step}» ثبت شد. می‌توانید این صفحه را ببندید.</AlertDescription>
              </Alert>
            ) : data.status === "ready" ? (
              <>
                {use.error && (
                  <Alert variant="destructive">
                    <CircleSlash />
                    <AlertDescription>{errorMessage(use.error)}</AlertDescription>
                  </Alert>
                )}
                <Button disabled={use.isPending} onClick={() => use.mutate()}>
                  {use.isPending && <Spinner />}
                  ثبت «{data.decision_label}»
                </Button>
              </>
            ) : (
              <Alert variant="destructive">
                <CircleSlash />
                <AlertDescription>{data.message}</AlertDescription>
              </Alert>
            )}
            <p className="text-2xs text-muted-foreground">
              برای دیدن جزئیات یا نوشتن یادداشت، کار را از <Link to="/tasks" className="text-primary underline underline-offset-2">کارتابل</Link> باز کنید.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
