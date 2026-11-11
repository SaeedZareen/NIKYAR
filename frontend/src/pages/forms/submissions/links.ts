import type { Schemas } from "@/lib/api/client"
import { formatDateTime, toFaDigits } from "@/lib/format"

type Submission = Pick<Schemas["FormSubmission"], "id" | "form" | "status">

/** پیش‌نویس در صفحه‌ی پر کردن ادامه می‌یابد؛ ثبت نهایی در صفحه‌ی مشاهده باز می‌شود. */
export const submissionUrl = (s: Submission) => (s.status === "draft" ? `/forms/${s.form}/fill?draft=${s.id}` : `/forms/submissions/${s.id}`)

export const editUrl = (s: Submission) => `/forms/${s.form}/fill?edit=${s.id}`

/** برگه‌ی چاپ در زبانه‌ی تازه؛ print=1 پنجره‌ی چاپ مرورگر را خودکار باز می‌کند. */
export const printUrl = (s: Pick<Submission, "id">) => `/print/submissions/${s.id}?print=1`

/** مشخصات ثبت (صفحه‌ی مشاهده و برگه‌ی چاپ)؛ ثبت‌کننده‌ی فرم بی‌نام نمی‌آید. */
export function submissionInfo(s: Schemas["FormSubmission"]) {
  return [
    { label: "شماره", value: s.number ? toFaDigits(s.number) : null },
    { label: "زمان ثبت", value: s.submitted_at ? formatDateTime(s.submitted_at) : null },
    ...(s.created_by === null ? [] : [{ label: "ثبت‌کننده", value: s.created_by_name }]),
    { label: "نسخه‌ی فرم", value: toFaDigits(s.version_number) },
  ]
}
