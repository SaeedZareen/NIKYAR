import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { toast } from "sonner"
import { TASKS_KEY } from "@/app/workflow"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX = 2000

/**
 * گفت‌وگوی درخواست: پیام‌های پیوسته‌ی درخواست‌دهنده و گیرنده‌ها، جدا از یادداشت هر تصمیم؛
 * هر پیام به شرکت‌کنندگان دیگر اعلان می‌شود.
 */
export function Discussion({ requestId }: { requestId: number }) {
  const qc = useQueryClient()
  const key = [...TASKS_KEY, "comments", requestId]
  const comments = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/api/workflow/comments/", { params: { query: { request: requestId } } })),
    refetchInterval: 30_000,
  })
  const [text, setText] = React.useState("")
  const [error, setError] = React.useState("")
  const id = React.useId()
  const send = useMutation({
    mutationFn: () => unwrap(api.POST("/api/workflow/comments/", { body: { request: requestId, text } })),
    onSuccess: () => {
      setText("")
      qc.invalidateQueries({ queryKey: key })
      toast.success("پیام فرستاده شد.")
    },
    onError: (e) => (e instanceof ApiError && e.fields.text ? setError(e.fields.text) : toast.error(errorMessage(e))),
  })
  const rows = comments.data ?? []

  return (
    <Section
      title="گفت‌وگو"
      description="پیام‌های این‌جا را درخواست‌دهنده و همه‌ی گیرنده‌های درخواست می‌بینند و برای هر پیام اعلان می‌گیرند؛ برای پرسش و پاسخ پیش از تصمیم."
      meta={rows.length ? `${formatNumber(rows.length)} پیام` : undefined}
      footer={
        <form
          className="flex w-full flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return setError("متن پیام را بنویسید.")
            send.mutate()
          }}
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={id} className="sr-only">
              پیام تازه
            </FieldLabel>
            <Textarea
              id={id}
              rows={2}
              maxLength={MAX}
              placeholder="پیام تازه…"
              value={text}
              aria-invalid={!!error}
              onChange={(e) => {
                setText(e.target.value)
                setError("")
              }}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <div>
            <Button type="submit" variant="outline" disabled={send.isPending}>
              <Send /> ارسال پیام
            </Button>
          </div>
        </form>
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{comments.isPending ? "در حال بارگذاری…" : "هنوز پیامی نیست."}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="پیام‌های گفت‌وگو">
          {rows.map((c) => (
            <li key={c.id} className={cn("flex flex-col gap-0.5 rounded-md border px-3 py-2", c.mine ? "border-primary/30 bg-primary/5" : "bg-background")}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-medium">{c.mine ? "شما" : c.author_name}</span>
                <span className="text-2xs text-muted-foreground tabular-nums">{formatDateTime(c.at)}</span>
              </div>
              <p className="text-xs whitespace-pre-line">{c.text}</p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}
