import * as React from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"
import { SUBMISSIONS_KEY } from "@/app/forms"
import { PageError, PageFallback } from "@/app/route-states"
import { FillForm, type FillTarget } from "./fill-form"

/**
 * پر کردن فرم: فرم تازه (/forms/:formId/fill) یا ادامه‌ی پیش‌نویس (?draft=شناسه).
 * پیش‌نویس با هر تغییر خودکار ذخیره می‌شود؛ پس از نخستین ذخیره، شناسه‌اش در نشانی می‌آید تا بازخوانی صفحه آن را از دست ندهد.
 */
export default function FormFillPage() {
  const { formId } = useParams()
  const [search] = useSearchParams()
  // پیش‌نویس (?draft=) یا ویرایش ثبت نهایی در مهلت «ویرایش پس از ثبت» (?edit=)
  const draft = search.get("draft") ?? search.get("edit")

  const query = useQuery({
    queryKey: ["forms", "fill", formId, draft],
    queryFn: async () => {
      if (draft) {
        const sub = await unwrap(api.GET("/api/forms/submissions/{id}/", { params: { path: { id: Number(draft) } } }))
        return { context: sub.context, data: sub.data, submissionId: sub.id, updatedAt: sub.updated_at, editing: sub.status === "submitted" ? sub : null }
      }
      const context = await unwrap(api.GET("/api/forms/{id}/fill/", { params: { path: { id: formId ?? "" } } }))
      return { context, data: undefined, submissionId: null, updatedAt: null, editing: null }
    },
    staleTime: Infinity,
    gcTime: 0,
  })

  const qc = useQueryClient()
  const formKey = query.data?.context.form
  const title = query.data?.context.title
  const target = React.useMemo<FillTarget>(
    () => ({
      save: (id, data, submit) =>
        id
          ? unwrap(api.PATCH("/api/forms/submissions/{id}/", { params: { path: { id } }, body: { data, submit } }))
          : unwrap(api.POST("/api/forms/submissions/", { body: { form: formKey, data, submit } })),
      remove: (id) => unwrap(api.DELETE("/api/forms/submissions/{id}/", { params: { path: { id } } })),
      invalidate: () => {
        qc.invalidateQueries({ queryKey: SUBMISSIONS_KEY })
        qc.invalidateQueries({ queryKey: ["forms", "available"] })
      },
      back: { label: "فرم‌ها", to: "/forms" },
      again: { label: "ثبت دوباره‌ی همین فرم", to: `/forms/${formKey}/fill` },
      editUrl: (id) => `/forms/${formKey}/fill?edit=${id}`,
      submittedMessage: (saved) => (saved.number ? `فرم «${title}» با شماره‌ی ${toFaDigits(saved.number)} ثبت شد.` : `فرم «${title}» ثبت شد.`),
    }),
    [formKey, qc, title]
  )

  if (query.isPending) return <PageFallback />
  if (query.error) return <PageError error={query.error} onRetry={() => query.refetch()} />
  const { context, data, submissionId, updatedAt, editing } = query.data
  return (
    <FillForm
      key={draft ?? "new"}
      context={context}
      target={target}
      editing={editing}
      initialData={data}
      initialSubmission={submissionId}
      initialSavedAt={updatedAt}
      onCreated={(id) => {
        // فقط نشانی مرورگر (برای بازخوانی صفحه)؛ نه پیمایش مسیریاب، تا صفحه از نو ساخته نشود و هشدار خروج هم باز نشود.
        window.history.replaceState(window.history.state, "", `?draft=${id}`)
      }}
    />
  )
}

