import { useParams } from "react-router"
import { FileQuestion } from "lucide-react"
import { DescriptionList } from "@/components/description-list"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatDate, formatMoney, toFaDigits } from "@/lib/format"
import { employees, STATUS_LABELS, TYPE_LABELS } from "./sample-data"

/** نمونه‌ی صفحه‌ی جزئیات: نمایش فقط‌خواندنی با فهرست برچسب/مقدار. */
export default function EmployeePage() {
  const { id } = useParams()
  const e = employees.find((x) => x.id === id)

  if (!e) {
    return (
      <>
        <PageHeader title="پرونده پیدا نشد" breadcrumbs={[{ label: "جدول داده", to: "/ui-kit/data-table" }]} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestion />
            </EmptyMedia>
            <EmptyTitle>پرونده‌ای با این شناسه وجود ندارد.</EmptyTitle>
            <EmptyDescription>از فهرست پرسنل، پرونده‌ی دیگری را انتخاب کنید.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    )
  }

  const name = `${e.firstName} ${e.lastName}`
  return (
    <>
      <PageHeader
        title={name}
        description={
          <>
            کد پرسنلی {toFaDigits(e.code)} · {e.position} · <StatusBadge tone={e.status === "active" ? "success" : "warning"}>{STATUS_LABELS[e.status]}</StatusBadge>
          </>
        }
        breadcrumbs={[{ label: "جدول داده", to: "/ui-kit/data-table" }]}
      />
      <Section title="مشخصات">
        <DescriptionList
            items={[
              { label: "نام", value: e.firstName },
              { label: "نام خانوادگی", value: e.lastName },
              { label: "کد ملی", value: toFaDigits(e.nationalId), ltr: true },
              { label: "موبایل", value: toFaDigits(e.mobile), ltr: true },
              { label: "واحد سازمانی", value: e.unit },
              { label: "سمت", value: e.position },
              { label: "نوع استخدام", value: TYPE_LABELS[e.type] },
              { label: "تاریخ استخدام", value: formatDate(e.hireDate, "long") },
              { label: "حقوق پایه", value: formatMoney(e.salary) },
              { label: "نشانی", value: null },
            ]}
        />
      </Section>
    </>
  )
}
