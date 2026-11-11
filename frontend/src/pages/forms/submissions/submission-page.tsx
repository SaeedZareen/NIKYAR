import { Link, Navigate, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { PencilLine, Printer } from "lucide-react"
import { useAuth } from "@/app/auth"
import { SUBMISSIONS_KEY } from "@/app/forms"
import { DescriptionList } from "@/components/description-list"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { editUrl, printUrl, submissionInfo, submissionUrl } from "./links"
import { SubmissionSummary } from "./submission-summary"

/** مشاهده‌ی یک ثبت نهایی: مشخصات ثبت و مقدارهای فرم، با چاپ و (در مهلت) ویرایش. */
export default function SubmissionPage() {
  const id = useParams().id ?? ""
  const { user } = useAuth()
  const query = useQuery({ queryKey: [...SUBMISSIONS_KEY, "detail", id], queryFn: () => unwrap(api.GET("/api/forms/submissions/{id}/", { params: { path: { id: Number(id) } } })) })
  const s = query.data
  if (!s) {
    return (
      <>
        <PageHeader title="مشاهده‌ی ثبت" breadcrumbs={[{ label: "ثبت‌های من", to: "/forms/mine" }]} />
        {query.error ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>ثبت پیدا نشد</EmptyTitle>
              <EmptyDescription>{errorMessage(query.error)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </>
    )
  }
  // پیش‌نویس جای مشاهده ندارد؛ در صفحه‌ی پر کردن ادامه می‌یابد
  if (s.status === "draft") return <Navigate to={submissionUrl(s)} replace />
  const own = s.created_by === user?.id
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={s.form_title}
        meta={s.editable_until ? `ویرایش تا ${formatDateTime(s.editable_until)}` : undefined}
        breadcrumbs={own ? [{ label: "ثبت‌های من", to: "/forms/mine" }] : [{ label: "ثبت‌های فرم‌ها", to: "/forms/reports" }, { label: s.form_title, to: `/forms/reports/${s.form}` }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {s.editable_until && (
              <Button asChild variant="outline">
                <Link to={editUrl(s)}>
                  <PencilLine /> ویرایش
                </Link>
              </Button>
            )}
            <Button asChild>
              <a href={printUrl(s)} target="_blank" rel="noopener">
                <Printer /> چاپ
              </a>
            </Button>
          </div>
        }
      />
      <Section title="مشخصات ثبت">
        <DescriptionList items={submissionInfo(s)} />
      </Section>
      <Section title="اطلاعات فرم">
        <SubmissionSummary submission={s} />
      </Section>
    </div>
  )
}
