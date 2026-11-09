import * as React from "react"
import { useLookupItems } from "@/app/lookups"
import { useAuth } from "@/app/auth"
import { RichTextView } from "@/components/rich-text"
import { fileUrl, useFileInfo } from "@/lib/files"
import { formatNumber, toFaDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isDisplay, itemsOf, type ChoiceOption, type FieldDef, type FormDefinition } from "./definition"
import { useUnitOptions, usePositionNames, useUserNames } from "./org-options"
import type { RuleState } from "./rules"

// نمایش فقط‌خواندنی مقدارهای فرم (مرور پیش از ثبت؛ در 3.8 مشاهده و چاپ ثبت‌ها): برچسب و مقدار خوانای هر فیلد دیدنی.

const EMPTY = <span className="text-muted-foreground">—</span>
const fa = (v: unknown) => toFaDigits(String(v))
const optionsOf = (field: FieldDef, key = "options") => (field.props?.[key] ?? []) as ChoiceOption[]

/** خلاصه‌ی فرم به تفکیک بخش؛ فیلدهای پنهان (با قاعده یا «فیلد پنهان») نمی‌آیند. */
export function FormSummary({ definition, data, rules, title }: { definition: FormDefinition; data: Record<string, unknown>; rules?: RuleState; title: string }) {
  const sections = definition.sections.filter((s) => !rules?.hiddenSections.has(s.id))
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => {
        const fields = section.fields.filter((f) => !isDisplay(f) && f.type !== "hidden" && !rules?.hidden.has(f.id))
        if (!fields.length) return null
        return (
          <section key={section.id} aria-label={section.title || title} className="flex flex-col gap-1.5">
            <h3 className="border-b pb-1 text-xs font-semibold">{section.title || title}</h3>
            <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
              {fields.map((f) => (
                <React.Fragment key={f.id}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="min-w-0 text-xs break-words">{f.type === "calculated" ? <Calculated field={f} value={rules?.calculated[f.id]} /> : <FieldValue field={f} value={data[f.id]} />}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}

function Calculated({ field, value }: { field: FieldDef; value?: number }) {
  if (value === undefined) return EMPTY
  const unit = field.props?.format === "amount" ? " ریال" : field.props?.format === "days" ? " روز" : field.props?.unit ? ` ${field.props.unit}` : ""
  return <>{formatNumber(value) + unit}</>
}

/** مقدار خوانای یک فیلد (در گروه تکرارشونده برای هر خانه). */
export function FieldValue({ field, value }: { field: FieldDef; value: unknown }) {
  // امضای «حساب من» و مشخصات ثبت‌کننده را سرور هنگام ثبت می‌گذارد
  if (field.type === "signature") return <span className="text-muted-foreground">امضای حساب شما هنگام ثبت افزوده می‌شود.</span>
  if (field.type === "submitter") return <Submitter value={value} />
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return EMPTY
  switch (field.type) {
    case "textarea":
      return <span className="whitespace-pre-line">{String(value)}</span>
    case "number":
      return <>{formatNumber(Number(value)) + (field.props?.unit ? ` ${field.props.unit}` : "")}</>
    case "amount":
      return <>{formatNumber(Number(value))} ریال</>
    case "date":
    case "time":
    case "datetime":
    case "national_code":
    case "legal_national_id":
    case "economic_code":
    case "registration_number":
    case "mobile":
    case "phone":
    case "postal_code":
    case "card_number":
    case "vehicle_plate":
      return <span className="tabular-nums">{fa(value)}</span>
    case "iban":
    case "email":
    case "barcode":
      return <bdi dir="ltr">{String(value)}</bdi>
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-primary underline">
          {String(value)}
        </a>
      )
    case "date_range":
    case "time_range": {
      const v = value as { start?: string; end?: string }
      return <>{`از ${v.start ? fa(v.start) : "—"} تا ${v.end ? fa(v.end) : "—"}`}</>
    }
    case "boolean":
      return <>{value ? "بله" : "خیر"}</>
    case "consent":
      return <>پذیرفته شد</>
    case "choice":
      return <>{choiceText(optionsOf(field), value, field)}</>
    case "multi_choice":
      return <>{(value as unknown[]).map((v) => choiceText(optionsOf(field), v, field)).join("، ")}</>
    case "scale":
      return <>{`${fa(value)} از ${fa(field.props?.max ?? 5)}`}</>
    case "matrix": {
      const columns = optionsOf(field, "columns")
      return (
        <ul className="flex flex-col gap-0.5">
          {optionsOf(field, "rows").map((r) => (
            <li key={r.value}>
              {r.label}: {columns.find((c) => c.value === (value as Record<string, string>)[r.value])?.label ?? "—"}
            </li>
          ))}
        </ul>
      )
    }
    case "region": {
      const v = value as { province?: string; city?: string }
      return <>{[v.province, v.city].filter(Boolean).join("، ")}</>
    }
    case "location": {
      const v = value as { lat?: number; lng?: number; accuracy?: number }
      return (
        <span className="tabular-nums">
          {`عرض ${fa(v.lat)}، طول ${fa(v.lng)}`}
          {v.accuracy !== undefined && ` (دقت حدود ${formatNumber(v.accuracy)} متر)`}
        </span>
      )
    }
    case "rich_text":
      return <RichTextView html={String(value)} />
    case "lookup":
      return <LookupValue field={field} value={value} />
    case "user":
      return <UserValue value={value} />
    case "org_unit":
      return <UnitValue value={value} />
    case "position":
      return <PositionValue value={value} />
    case "attachment":
    case "voice":
      return <FilesValue ids={value as string[]} />
    case "signature_pad":
      return <img src={`${fileUrl(String(value))}?inline=1`} alt={`امضای «${field.label}»`} className="h-16 rounded border bg-white" />
    case "table":
      return <GroupValue field={field} rows={value as Record<string, unknown>[]} />
    default:
      return <>{String(value)}</>
  }
}

function choiceText(options: ChoiceOption[], value: unknown, field: FieldDef) {
  if (value && typeof value === "object" && "other" in value) return `${String(field.props?.other_label || "سایر")}: ${(value as { other: string }).other}`
  return options.find((o) => o.value === value)?.label ?? String(value)
}

const list = (value: unknown) => (Array.isArray(value) ? value : [value])

function LookupValue({ field, value }: { field: FieldDef; value: unknown }) {
  const items = useLookupItems(String(field.props?.list ?? "")).data ?? []
  return <>{list(value).map((v) => items.find((i) => i.code === v)?.title ?? String(v)).join("، ")}</>
}

function UserValue({ value }: { value: unknown }) {
  const ids = list(value).map(Number)
  const names = useUserNames(ids).data ?? []
  return <>{ids.map((id) => names.find((u) => u.id === id)?.full_name ?? fa(id)).join("، ")}</>
}

function UnitValue({ value }: { value: unknown }) {
  const units = useUnitOptions()
  return <>{list(value).map((v) => units.find((u) => u.value === String(v))?.label ?? fa(v)).join("، ")}</>
}

function PositionValue({ value }: { value: unknown }) {
  const positions = usePositionNames() ?? []
  return <>{list(value).map((v) => positions.find((p) => p.id === Number(v))?.title ?? fa(v)).join("، ")}</>
}

function FilesValue({ ids }: { ids: string[] }) {
  const files = useFileInfo(ids).data ?? []
  return (
    <ul className="flex flex-col gap-0.5">
      {ids.map((id) => {
        const f = files.find((x) => x.id === id)
        return (
          <li key={id} dir="auto">
            {f ? `${f.name} (${f.extension.toUpperCase()})` : "فایل"}
          </li>
        )
      })}
    </ul>
  )
}

function Submitter({ value }: { value: unknown }) {
  const { user } = useAuth()
  const v = value as Record<string, string> | undefined
  if (v && Object.keys(v).length) return <>{Object.values(v).filter(Boolean).join(" · ")}</>
  return <>{user?.full_name || user?.username} <span className="text-muted-foreground">(هنگام ثبت افزوده می‌شود)</span></>
}

function GroupValue({ field, rows }: { field: FieldDef; rows: Record<string, unknown>[] }) {
  const items = itemsOf(field)
  const itemLabel = String(field.props?.item_label || "ردیف")
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-xs")}>
        <thead>
          <tr className="bg-muted/50">
            <th scope="col" className="border px-2 py-1 text-start font-medium">
              <span className="sr-only">{itemLabel}</span>#
            </th>
            {items.map((i) => (
              <th key={i.id} scope="col" className="border px-2 py-1 text-start font-medium">
                {i.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, n) => (
            <tr key={n}>
              <td className="border px-2 py-1 tabular-nums">{fa(n + 1)}</td>
              {items.map((i) => (
                <td key={i.id} className="border px-2 py-1 align-top">
                  <FieldValue field={i} value={row[i.id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
