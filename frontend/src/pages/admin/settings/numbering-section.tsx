import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber, onlyDigits, toFaDigits } from "@/lib/format"
import { schemas } from "@/lib/validators"
import type { SectionInfo } from "./settings-form"

type Sequence = Schemas["Sequence"]
type Reset = Schemas["ResetEnum"]
const KEY = ["numbering"]
const EMPTY: Sequence[] = []
const col = columnHelper<Sequence>()

const RESETS: Record<Reset, string> = { year: "آغاز هر سال شمسی", fiscal: "آغاز هر سال مالی", never: "هرگز (ادامه‌دار)" }
const TOKENS = [
  { token: "{year}", label: "سال" },
  { token: "{yy}", label: "دو رقم سال" },
  { token: "{fyear}", label: "سال مالی" },
  { token: "{month}", label: "ماه" },
  { token: "{seq:5}", label: "شمارنده" },
]

/** «شماره‌گذاری اسناد» در تنظیمات: فهرست شمارنده‌ها و ویرایش الگو با پیش‌نمایش زنده. */
export function NumberingSection({ section }: { section: SectionInfo }) {
  const sequences = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/numbering/sequences/")) })
  const [editing, setEditing] = React.useState<Sequence | null>(null)

  const columns = React.useMemo<DataTableColumn<Sequence>[]>(
    () => [
      col.accessor("title", { header: "نوع سند", meta: { label: "نوع سند", primary: true, wrap: true } }),
      col.accessor("pattern", { header: "الگو", enableSorting: false, meta: { label: "الگو" }, cell: (c) => <bdi>{c.getValue()}</bdi> }),
      col.accessor("reset_label", { header: "شروع دوباره", enableSorting: false, meta: { label: "شروع دوباره" } }),
      col.accessor("last_number", {
        header: "صادرشده",
        meta: { label: "صادرشده در دوره‌ی جاری", align: "end" },
        cell: (c) => <span className="tabular-nums">{c.getValue() ? formatNumber(c.getValue()) : "—"}</span>,
      }),
      col.accessor("next_preview", {
        header: "شماره‌ی بعدی",
        enableSorting: false,
        meta: { label: "شماره‌ی بعدی", exportValue: (s) => toFaDigits(s.next_preview) },
        cell: (c) => <bdi className="tabular-nums">{toFaDigits(c.getValue())}</bdi>,
      }),
      actionsColumn<Sequence>((s) => (
        <DropdownMenuItem onSelect={() => setEditing(s)}>
          <Pencil /> ویرایش الگو
        </DropdownMenuItem>
      )),
    ],
    [setEditing]
  )
  const view = useTableView("numbering", { urlKey: "n.", defaultSort: "title" })
  const table = useDataTable({ view, columns, data: sequences.data ?? EMPTY, getRowId: (s) => s.code })

  return (
    <Section title={section.title} description={section.description}>
      <DataTable
        table={table}
        view={view}
        caption="شمارنده‌های اسناد"
        loading={sequences.isPending}
        error={sequences.error}
        onRetry={() => sequences.refetch()}
        searchPlaceholder="نوع سند"
        exportFileName="شماره‌گذاری اسناد"
        empty={{ title: "هنوز نوع سندی شماره‌گذاری نمی‌شود" }}
      />
      {editing && <SequenceSheet key={editing.code} sequence={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </Section>
  )
}

const schema = z.object({
  pattern: schemas.required("الگوی شماره").pipe(z.string().max(60, "الگو حداکثر ۶۰ نویسه است.")),
  reset: z.enum(["year", "fiscal", "never"]),
  next_number: z.string(),
})
const LABELS = { pattern: "الگوی شماره", reset: "شروع دوباره", next_number: "شماره‌ی بعدی" }

/** مقدار پس از توقف تایپ (برای پیش‌نمایش سروری بدون درخواست به ازای هر کلید). */
function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function SequenceSheet({ sequence, ...sheet }: { sequence: Sequence; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, { pattern: sequence.pattern, reset: sequence.reset, next_number: "" })
  const patternInput = React.useRef<HTMLInputElement>(null)
  // آخرین جای مکان‌نما در فیلد الگو؛ تا کاربر در فیلد کلیک نکرده، نشانه به انتها افزوده می‌شود.
  const caret = React.useRef<{ start: number; end: number } | null>(null)
  const [pattern, reset, nextNumber] = form.watch(["pattern", "reset", "next_number"])
  const draft = useDebounced({ pattern, reset, next_number: nextNumber ? Number(nextNumber) : undefined })
  const preview = useQuery({
    queryKey: [...KEY, "preview", sequence.code, draft],
    queryFn: () => unwrap(api.POST("/api/numbering/sequences/{code}/preview/", { params: { path: { code: sequence.code } }, body: draft })),
    enabled: draft.pattern.trim() !== "",
    retry: false,
    placeholderData: (prev) => prev,
  })
  const previewError = preview.error instanceof ApiError ? (Object.values(preview.error.fields)[0] ?? preview.error.message) : null

  const save = useMutation({
    mutationFn: (body: Schemas["PatchedSequenceRequest"]) => unwrap(api.PATCH("/api/numbering/sequences/{code}/", { params: { path: { code: sequence.code } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success(`الگوی «${saved.title}» ذخیره شد؛ شماره‌ی بعدی: ${toFaDigits(saved.next_preview)}`)
      sheet.onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ pattern: v.pattern, reset: v.reset, ...(v.next_number ? { next_number: Number(v.next_number) } : {}) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  /** نشانه در جای مکان‌نما درج می‌شود. */
  const insert = (token: string) => {
    const el = patternInput.current
    const value = form.getValues("pattern")
    const { start, end } = caret.current ?? { start: value.length, end: value.length }
    caret.current = { start: start + token.length, end: start + token.length }
    form.setValue("pattern", value.slice(0, start) + token + value.slice(end), { shouldDirty: true, shouldValidate: form.formState.submitCount > 0 })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <FormSheet {...sheet} title={`شماره‌گذاری «${sequence.title}»`} onSubmit={onSubmit} submitting={save.isPending}>
      <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField
          control={form.control}
          name="pattern"
          label={LABELS.pattern}
          required
          className="col-span-full"
          description="متن ثابت (مثل «مرخصی» یا «/») همراه نشانه‌ها: سال، سال مالی، ماه و شمارنده. عدد کنار شمارنده طول آن است: {seq:5} یعنی ۰۰۰۱۲."
          hint={
            <span aria-live="polite">
              {previewError ? (
                <span className="text-destructive">{previewError}</span>
              ) : preview.data ? (
                <>
                  شماره‌ی بعدی: <bdi className="font-semibold text-foreground tabular-nums">{toFaDigits(preview.data.example)}</bdi>
                </>
              ) : (
                " "
              )}
            </span>
          }
          render={({ field, id, aria }) => (
            <div className="flex flex-col gap-2">
              <Input
                id={id}
                {...field}
                ref={patternInput}
                onSelect={(e) => (caret.current = { start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 })}
                dir="auto"
                autoComplete="off"
                {...aria}
              />
              <div role="group" aria-label="افزودن نشانه به الگو" className="flex flex-wrap gap-1.5">
                {TOKENS.map((t) => (
                  <Button key={t.token} type="button" variant="outline" size="sm" onClick={() => insert(t.token)}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        />
        <FormField
          control={form.control}
          name="reset"
          label={LABELS.reset}
          description="با شروع دوباره، شمارنده‌ی هر سال از ۱ آغاز می‌شود؛ پس الگو باید سال (یا سال مالی) را داشته باشد تا شماره تکراری نشود."
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RESETS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormField
          control={form.control}
          name="next_number"
          label={LABELS.next_number}
          description="اختیاری؛ برای ادامه‌ی شماره‌های سامانه‌ی قبلی. فقط بیشتر از آخرین شماره‌ی صادرشده پذیرفته می‌شود."
          hint={sequence.last_number ? `آخرین شماره‌ی صادرشده در دوره‌ی جاری: ${formatNumber(sequence.last_number)}` : "در دوره‌ی جاری هنوز شماره‌ای صادر نشده است."}
          render={({ field, id, aria }) => (
            <Input
              id={id}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              className="max-w-40 text-start tabular-nums"
              value={field.value}
              onChange={(e) => field.onChange(onlyDigits(e.target.value).slice(0, 9))}
              onBlur={field.onBlur}
              {...aria}
            />
          )}
        />
      </FormGrid>
    </FormSheet>
  )
}
