import { Link } from "react-router"
import { CircleCheck, FilePlus2, List, PencilLine } from "lucide-react"
import { Section } from "@/components/layout/section"
import { RichTextView } from "@/components/rich-text"
import { Button } from "@/components/ui/button"
import type { Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"
import { confirmationHtml } from "./confirmation-text"

type Submission = Schemas["FormSubmission"]

/** صفحه‌ی تأیید پس از ثبت: پیام فرم، شماره‌ی پیگیری، و کار بعدی (فرم‌ها، ثبت دوباره، ویرایش در مهلت). */
export function Confirmation({ title, template, submission, name, formId }: { title: string; template?: string; submission: Submission; name: string; formId: number }) {
  const number = submission.number ? toFaDigits(submission.number) : ""
  const date = submission.submitted_at ? formatDateTime(submission.submitted_at) : ""
  return (
    <Section
      title="ثبت شد"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to="/forms">
              <List /> بازگشت به فرم‌ها
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/forms/${formId}/fill`} reloadDocument>
              <FilePlus2 /> ثبت دوباره‌ی همین فرم
            </Link>
          </Button>
          {submission.editable_until && (
            <Button asChild variant="ghost">
              <Link to={`/forms/${formId}/fill?edit=${submission.id}`} reloadDocument>
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
