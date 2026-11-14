import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, RotateCcw } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { CHANNELS, channelsLabel, type Channel } from "@/app/notifications"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { TokenInput } from "@/components/form/token-input"
import { useAppForm } from "@/components/form/use-app-form"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { schemas } from "@/lib/validators"
import type { SectionInfo } from "./settings-form"

type Kind = Schemas["Kind"]
const KEY = ["notification-kinds"]
const EMPTY: Kind[] = []
const col = columnHelper<Kind>()

/** پیش‌نمایش با مقدارهای نمونه؛ جای‌گذار ناشناخته همان‌طور می‌ماند (مانند سرور). */
function preview(template: string, kind: Kind) {
  const samples = Object.fromEntries(kind.placeholders.map((p) => [p.name, p.sample]))
  return template.replace(/\{(\w+)\}/g, (m, name: string) => samples[name] ?? m)
}

/** «تنظیمات › متن اعلان‌ها»: متن هر نوع اعلان با جای‌گذارها و پیش‌نمایش. */
export function NotificationTemplatesSection({ section }: { section: SectionInfo }) {
  const kinds = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/notifications/kinds/")) })
  const [editing, setEditing] = React.useState<Kind | null>(null)
  const columns = React.useMemo<DataTableColumn<Kind>[]>(
    () => [
      col.accessor("title", { header: "نوع اعلان", meta: { label: "نوع اعلان", primary: true } }),
      col.accessor("preview", { header: "نمونه‌ی متن", enableSorting: false, meta: { label: "نمونه‌ی متن", wrap: true } }),
      col.accessor((k) => channelsLabel(k.channels), {
        id: "channels",
        header: "ارسال با",
        enableSorting: false,
        meta: { label: "ارسال با" },
        cell: (c) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {c.getValue()}
            {c.row.original.sms_pattern && <StatusBadge tone="info">پیامک الگویی</StatusBadge>}
          </span>
        ),
      }),
      col.accessor((k) => (k.is_custom ? "سفارشی" : "پیش‌فرض"), {
        id: "is_custom",
        header: "متن",
        enableSorting: false,
        meta: { label: "متن" },
        cell: (c) => <StatusBadge tone={c.row.original.is_custom ? "info" : "neutral"}>{c.getValue()}</StatusBadge>,
      }),
      actionsColumn<Kind>((k) => (
        <DropdownMenuItem onSelect={() => setEditing(k)}>
          <Pencil /> ویرایش متن
        </DropdownMenuItem>
      )),
    ],
    [setEditing]
  )
  const view = useTableView("notification-kinds", { urlKey: "k.", defaultSort: "title" })
  const table = useDataTable({ view, columns, data: kinds.data ?? EMPTY, getRowId: (k) => k.code })

  return (
    <Section title={section.title} description={section.description}>
      <DataTable
        table={table}
        view={view}
        caption="متن اعلان‌ها"
        loading={kinds.isPending}
        error={kinds.error}
        onRetry={() => kinds.refetch()}
        searchPlaceholder="نوع اعلان"
        empty={{ title: "نوع اعلانی تعریف نشده است" }}
      />
      {editing && <TemplateSheet key={editing.code} kind={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </Section>
  )
}

const schema = z.object({
  template: schemas.required("متن اعلان").pipe(z.string().max(500, "متن حداکثر ۵۰۰ نویسه است.")),
  channels: z.array(z.enum(["sms", "email"])),
  sms_pattern: z.string().trim().max(100, "کد الگو حداکثر ۱۰۰ نویسه است."),
  sms_variables: z.string(),
})

/** متغیرهای الگو به ترتیب، از جای‌گذارهای نوشته‌شده: «{name} {username}» ← ["name", "username"]. */
const variablesOf = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])

function TemplateSheet({ kind, ...sheet }: { kind: Kind; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, {
    template: kind.template,
    channels: kind.channels as Channel[],
    sms_pattern: kind.sms_pattern,
    sms_variables: kind.sms_variables.map((v) => `{${v}}`).join(" "),
  })
  const pattern = form.watch("sms_pattern")
  const template = form.watch("template")
  const save = useMutation({
    mutationFn: (body: Schemas["PatchedKindRequest"]) => unwrap(api.PATCH("/api/notifications/kinds/{code}/", { params: { path: { code: kind.code } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: KEY })
      toast.success(`متن اعلان «${saved.title}» ذخیره شد.`)
      sheet.onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ ...v, sms_variables: v.sms_pattern ? variablesOf(v.sms_variables) : [] })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const tokens = kind.placeholders.map((p) => ({ token: `{${p.name}}`, label: p.label }))

  return (
    <FormSheet
      {...sheet}
      title={`متن اعلان «${kind.title}»`}
      onSubmit={onSubmit}
      submitting={save.isPending}
      secondaryAction={
        template !== kind.default_template && (
          <Button type="button" variant="ghost" onClick={() => form.setValue("template", kind.default_template, { shouldDirty: true })}>
            <RotateCcw /> متن پیش‌فرض
          </Button>
        )
      }
    >
      <ErrorSummary
        errors={form.formState.errors}
        labels={{ template: "متن اعلان", channels: "ارسال پیش‌فرض با", sms_pattern: "کد الگوی پیامک", sms_variables: "متغیرهای الگو" }}
        submitCount={form.formState.submitCount}
      />
      <FormGrid>
        <FormField
          control={form.control}
          name="template"
          label="متن اعلان"
          required
          className="col-span-full"
          description="دکمه‌های زیر فیلد، جای‌گذار را در جای مکان‌نما می‌گذارند؛ هنگام ساخت اعلان، مقدار واقعی جای آن می‌نشیند."
          hint={
            <span aria-live="polite">
              نمونه: <span className="text-foreground">{preview(template, kind)}</span>
            </span>
          }
          render={({ field, id, aria }) => (
            <TokenInput
              id={id}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              tokens={tokens}
              tokensLabel="افزودن جای‌گذار"
              multiline
              maxLength={500}
              {...aria}
            />
          )}
        />
        {kind.direct ? (
          <p className="col-span-full text-2xs text-muted-foreground">این پیامک مستقیم است: فقط با پیامک و بی‌درنگ فرستاده می‌شود و کاربر نمی‌تواند آن را خاموش کند.</p>
        ) : (
          <FormField
            control={form.control}
            name="channels"
            label="ارسال پیش‌فرض با"
            group
            description="اعلان درون سامانه همیشه فرستاده می‌شود؛ پیامک و ایمیل فقط اگر در «پیامک و ایمیل» تنظیم شده باشند. هر کاربر می‌تواند انتخاب خودش را داشته باشد."
            render={({ field, id, aria: { "aria-required": _required, ...aria } }) => (
              <div id={id} tabIndex={-1} role="group" className="flex min-h-7 flex-wrap items-center gap-4 outline-none" {...aria}>
                {CHANNELS.map((c) => (
                  <div key={c.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-${c.value}`}
                      checked={field.value.includes(c.value)}
                      onCheckedChange={(v) => field.onChange(v ? [...field.value, c.value] : field.value.filter((x) => x !== c.value))}
                    />
                    <Label htmlFor={`${id}-${c.value}`} className="font-normal">
                      {c.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="sms_pattern"
          label="کد الگوی پیامک"
          description="اگر درگاه پیامک برای این اعلان «الگو» (پترن) تأیید کرده است، کد آن را بنویسید تا پیامک با الگو فرستاده شود؛ پیامک الگویی به خط‌های خدماتی و شماره‌های مسدودِ تبلیغات هم می‌رسد. خالی یعنی همان متن بالا فرستاده می‌شود. مگفا الگو ندارد و متن را می‌فرستد."
          render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" className="max-w-60" {...field} {...aria} />}
        />
        {pattern && (
          <FormField
            control={form.control}
            name="sms_variables"
            label="متغیرهای الگو"
            className="col-span-full"
            description="جای‌گذارها را به ترتیب متغیرهای الگو بگذارید. در sms.ir و آی‌پی‌پنل نام متغیر در الگوی درگاه باید همین نام لاتین باشد (مثلاً name)؛ در کاوه‌نگار و ملی‌پیامک ترتیب ملاک است و کاوه‌نگار حداکثر سه متغیر می‌پذیرد."
            render={({ field, id, aria }) => (
              <TokenInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} tokens={tokens} tokensLabel="افزودن متغیر" {...aria} />
            )}
          />
        )}
      </FormGrid>
    </FormSheet>
  )
}
