import type { FormDefinition } from "@/components/form-renderer/definition"
import { applyRules } from "@/components/form-renderer/rules"
import { FormSummary } from "@/components/form-renderer/value-view"
import type { Schemas } from "@/lib/api/client"

export type SubmissionDetail = Schemas["FormSubmissionDetail"]

/** مقدارهای ثبت با همان قاعده‌های نسخه‌ای که با آن پر شده (فیلدهای پنهان و محاسبه‌ای). */
export function SubmissionSummary({ submission }: { submission: SubmissionDetail }) {
  const definition = submission.context.definition as FormDefinition
  const { values, state } = applyRules(definition, submission.data)
  return <FormSummary definition={definition} data={values} rules={state} title={submission.form_title} submitted />
}
