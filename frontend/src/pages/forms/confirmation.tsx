import { Link } from "react-router"
import { CircleCheck, FilePlus2, List, PencilLine } from "lucide-react"
import { Section } from "@/components/layout/section"
import { RichTextView } from "@/components/rich-text"
import { Button } from "@/components/ui/button"
import type { Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"
import { confirmationHtml } from "./confirmation-text"

/** آنچه صفحه‌ی تأیید از ثبت فرم یا درخواست فرایند لازم دارد. */
export type Confirmed = Pick<Schemas["FormSubmission"], "id" | "number" | "submitted_at"> & { editable_until?: string | null }

/** صفحه‌ی تأیید پس از ثبت: پیام فرم، شماره‌ی پیگیری، و کار بعدی (بازگشت، ثبت دوباره، ویرایش در مهلت). */
export function Confirmation({
  title,
  template,
  submission,
  name,
  back,
  again,
  editUrl,
}: {
  title: string
  template?: string
  submission: Confirmed
  name: string
  back: { label: string; to: string }
  again: { label: string; to: string }
  editUrl?: (id: number) => string
}) {
  const number = submission.number ? toFaDigits(submission.number) : ""
  const date = submission.submitted_at ? formatDateTime(submission.submitted_at) : ""
  return (
    <Section
      title="ثبت شد"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to={back.to}>
              <List /> بازگشت به {back.label}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={again.to} reloadDocument>
              <FilePlus2 /> {again.label}
            </Link>
          </Button>
          {submission.editable_until && editUrl && (
            <Button asChild variant="ghost">
              <Link to={editUrl(submission.id)} reloadDocument>
                <PencilLine /> ویرایش ثبت
              </Link>
            </Button>
          )}
          {submission.editable_until && <span className="text-2xs text-muted-foreground">ویرایش تا {formatDateTime(submission.editable_until)}</span>}
        </div>
      }
    >
      <div role="status" className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div className="flex flex-col gap-2">
          <RichTextView html={confirmationHtml(template, { number, name, date, form: title })} />
          {number && (
            <p className="text-xs">
              شماره‌ی پیگیری: <span className="font-semibold">{number}</span>
            </p>
          )}
        </div>
      </div>
    </Section>
  )
}
