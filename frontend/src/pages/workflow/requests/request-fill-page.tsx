import * as React from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { REQUESTS_KEY } from "@/app/workflow"
import { StaticField } from "@/components/form/form-field"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { UserPicker } from "@/components/user-picker"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"
import { useAuth } from "@/app/auth"
import { PageError, PageFallback } from "@/app/route-states"
import { FillForm, type FillTarget } from "@/pages/forms/fill-form"

type Person = { id: number; name: string }

/**
 * ثبت درخواست تازه‌ی یک فرایند (/requests/new/:processId) یا ادامه‌ی پیش‌نویس آن (?draft=شناسه).
 * همان پرکننده‌ی فرم‌ها: ذخیره‌ی خودکار پیش‌نویس، مرور پیش از ثبت و صفحه‌ی تأیید با شماره‌ی درخواست.
 */
export default function RequestFillPage() {
  const { processId } = useParams()
  const [search] = useSearchParams()
  const draft = search.get("draft")
  const query = useQuery({
    queryKey: ["workflow", "fill", processId, draft],
    queryFn: async () => {
      if (draft) {
        const req = await unwrap(api.GET("/api/workflow/requests/{id}/", { params: { path: { id: Number(draft) } } }))
        if (!req.context) throw new Error("این درخواست دیگر پیش‌نویس نیست.")
        const behalf = req.requester !== req.created_by ? { id: req.requester, name: req.requester_name } : null
        return { context: req.context, data: req.data, requestId: req.id, updatedAt: req.updated_at, behalf }
      }
      const context = await unwrap(api.GET("/api/workflow/start/{id}/", { params: { path: { id: processId ?? "" } } }))
      return { context, data: undefined, requestId: null, updatedAt: null, behalf: null }
    },
    staleTime: Infinity,
    gcTime: 0,
  })

  if (query.isPending) return <PageFallback />
  if (query.error) return <PageError error={query.error} onRetry={() => query.refetch()} />
  return <RequestFill key={draft ?? "new"} {...query.data} />
}

type Loaded = { context: Schemas["StartContext"]; data?: Record<string, unknown>; requestId: number | null; updatedAt: string | null; behalf: Person | null }

function RequestFill({ context, data, requestId, updatedAt, behalf: initialBehalf }: Loaded) {
  const { user } = useAuth()
  // «به نام»: خالی یعنی خود کاربر. در ref تا مقصد ذخیره پایدار بماند و ذخیره‌ی بعدی همین را بفرستد.
  const [behalf, setBehalf] = React.useState<Person | null>(initialBehalf)
  const behalfRef = React.useRef<Person | null>(initialBehalf)
  const pick = (p: Person | null) => {
    behalfRef.current = p
    setBehalf(p)
  }

  const qc = useQueryClient()
  const { process, title } = context
  const target = React.useMemo<FillTarget>(
    () => ({
      save: (id, data, submit) => {
        const body = { data, submit, requester: behalfRef.current?.id ?? null }
        return id
          ? unwrap(api.PATCH("/api/workflow/requests/{id}/", { params: { path: { id } }, body }))
          : unwrap(api.POST("/api/workflow/requests/", { body: { ...body, process } }))
      },
      remove: (id) => unwrap(api.DELETE("/api/workflow/requests/{id}/", { params: { path: { id } } })),
      invalidate: () => qc.invalidateQueries({ queryKey: REQUESTS_KEY }),
      back: { label: "درخواست جدید", to: "/requests/new" },
      confirmation: "<p>درخواست «{فرم}» ثبت شد.</p>",
      again: { label: "ثبت درخواست دیگر", to: `/requests/new/${process}` },
      submittedMessage: (saved) => `درخواست «${title}» با شماره‌ی ${toFaDigits(saved.number)} ثبت شد.`,
    }),
    [process, qc, title]
  )

  return (
    <FillForm
      context={context}
      target={target}
      editing={null}
      initialData={data}
      initialSubmission={requestId}
      initialSavedAt={updatedAt}
      before={
        context.on_behalf && (
          <Section title="ثبت‌کننده" description="اگر درخواست را برای همکار دیگری ثبت می‌کنید، نام او را انتخاب کنید؛ درخواست به نام او پیش می‌رود و ثبت شما در سابقه‌ی درخواست می‌ماند.">
            <StaticField label="به نام">
              <div className="flex items-center gap-1">
                <UserPicker aria-label="به نام" value={behalf} onChange={pick} placeholder={`خودم (${user?.full_name || user?.username || ""})`} />
                {behalf && (
                  <Button type="button" variant="ghost" size="icon" aria-label="ثبت به نام خودم" title="ثبت به نام خودم" onClick={() => pick(null)}>
                    <X />
                  </Button>
                )}
              </div>
            </StaticField>
          </Section>
        )
      }
      onCreated={(id) => window.history.replaceState(window.history.state, "", `?draft=${id}`)}
    />
  )
}
