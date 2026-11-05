// حالت‌های عمومی مسیرها: در حال بارگذاری، صفحه‌ی ناموجود و خطای نمایش.
import type * as React from "react"
import { useRouteError } from "react-router"
import { ShieldOff } from "lucide-react"
import { useAuth } from "@/app/auth"
import type { Access } from "@/app/navigation"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function PageFallback() {
  return (
    <div role="status" className="flex flex-col gap-3" aria-busy="true" aria-label="در حال بارگذاری صفحه">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function NotFound() {
  return <PageHeader title="صفحه پیدا نشد" description="نشانی واردشده در سامانه وجود ندارد. از منو بخش موردنظر را انتخاب کنید." />
}

export function RouteError() {
  const error = useRouteError()
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertTitle>نمایش این صفحه با خطا روبه‌رو شد.</AlertTitle>
        <AlertDescription>
          <p>{error instanceof Error ? error.message : "خطای ناشناخته"}</p>
          <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>
            بارگذاری دوباره
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}

/** نگهبان مجوز هر صفحه: بدون مجوز، پیام روشن به‌جای صفحه‌ی خالی یا خطای سرور. */
export function RequireAccess({ access, children }: { access: Access; children: React.ReactNode }) {
  const { user, can } = useAuth()
  const allowed = access === undefined || (access === "superuser" ? !!user?.is_superuser : can(access))
  if (allowed) return children
  return (
    <>
      <PageHeader title="دسترسی ندارید" />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldOff />
          </EmptyMedia>
          <EmptyTitle>برای مشاهده‌ی این بخش مجوز ندارید.</EmptyTitle>
          <EmptyDescription>اگر به این بخش نیاز دارید، از راهبر سامانه بخواهید نقش مناسب را به شما بدهد.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  )
}
