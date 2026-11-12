import * as React from "react"
import { useQueries } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"
import { formatNumber, toFaDigits } from "@/lib/format"
import { itemsOf, type ChoiceOption, type FieldDef, type FormDefinition } from "./definition"
import { usePositionNames, useUnitOptions, useUserNames } from "./org-options"
import { recordLabel } from "./record-names"

// متن ساده‌ی مقدار هر فیلد، برای ستون‌های جدول ثبت‌ها، جست‌وجو و خروجی اکسل (نمایش کامل در value-view).

/** نام‌های لازم برای خواندن مقدارهای شناسه‌دار (کاربر، واحد، سمت، قلم فهرست). */
export type Names = {
  users: Map<number, string>
  units: Map<string, string>
  positions: Map<number, string>
  lookups: Map<string, Map<string, string>>
  /** «منبع#شناسه» ← شماره (فیلد ارجاع به ثبت یا درخواست) */
  records: Map<string, string>
}

const fa = (v: unknown) => toFaDigits(String(v))
const list = (value: unknown) => (Array.isArray(value) ? value : [value])
const optionsOf = (field: FieldDef, key = "options") => (field.props?.[key] ?? []) as ChoiceOption[]

export function isEmptyValue(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)
}

export function choiceText(field: FieldDef, value: unknown): string {
  if (value && typeof value === "object" && "other" in value) return `${String(field.props?.other_label || "سایر")}: ${(value as { other: string }).other}`
  return optionsOf(field).find((o) => o.value === value)?.label ?? String(value)
}

function htmlText(html: string): string {
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim()
}

/** متن یک‌خطی مقدار؛ رشته‌ی خالی یعنی بی‌مقدار. */
export function fieldText(field: FieldDef, value: unknown, names: Names): string {
  if (isEmptyValue(value)) return ""
  switch (field.type) {
    case "number":
      return formatNumber(Number(value)) + (field.props?.unit ? ` ${field.props.unit}` : "")
    case "amount":
      return formatNumber(Number(value))
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
      return fa(value)
    case "date_range":
    case "time_range": {
      const v = value as { start?: string; end?: string }
      return `${v.start ? fa(v.start) : "—"} تا ${v.end ? fa(v.end) : "—"}`
    }
    case "boolean":
      return value ? "بله" : "خیر"
    case "consent":
      return "پذیرفته شد"
    case "choice":
      return choiceText(field, value)
    case "multi_choice":
      return list(value)
        .map((v) => choiceText(field, v))
        .join("، ")
    case "scale":
      return `${fa(value)} از ${fa(field.props?.max ?? 5)}`
    case "matrix": {
      const columns = optionsOf(field, "columns")
      return optionsOf(field, "rows")
        .map((r) => `${r.label}: ${columns.find((c) => c.value === (value as Record<string, string>)[r.value])?.label ?? "—"}`)
        .join("؛ ")
    }
    case "region": {
      const v = value as { province?: string; city?: string }
      return [v.province, v.city].filter(Boolean).join("، ")
    }
    case "location": {
      const v = value as { lat?: number; lng?: number }
      return `${fa(v.lat)}، ${fa(v.lng)}`
    }
    case "rich_text":
      return htmlText(String(value))
    case "lookup": {
      const items = names.lookups.get(String(field.props?.list ?? ""))
      return list(value)
        .map((v) => items?.get(String(v)) ?? String(v))
        .join("، ")
    }
    case "user":
      return list(value)
        .map((v) => names.users.get(Number(v)) ?? fa(v))
        .join("، ")
    case "org_unit":
      return list(value)
        .map((v) => names.units.get(String(v)) ?? fa(v))
        .join("، ")
    case "position":
      return list(value)
        .map((v) => names.positions.get(Number(v)) ?? fa(v))
        .join("، ")
    case "record": {
      const source = String(field.props?.source ?? "")
      return list(value)
        .map((v) => names.records.get(`${source}#${v}`) ?? fa(v))
        .join("، ")
    }
    case "submitter":
      return Object.values(value as Record<string, string>)
        .filter(Boolean)
        .join(" · ")
    case "attachment":
    case "voice":
      return `${formatNumber(list(value).length)} فایل`
    case "signature":
    case "signature_pad":
      return "امضا شده"
    case "table":
      return `${formatNumber(list(value).length)} ${String(field.props?.item_label || "ردیف")}`
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value)
  }
}

/** شناسه‌های عددی این فیلدها در داده‌ها (با ردیف‌های گروه تکرارشونده)، مرتب. */
function idsOf(fields: FieldDef[], rows: Record<string, unknown>[]): number[] {
  const keys = new Set(fields.map((f) => f.id))
  const ids = new Set<number>()
  const collect = (data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (keys.has(key)) {
        for (const v of list(value)) if (!isEmptyValue(v)) ids.add(Number(v))
      } else if (Array.isArray(value)) {
        for (const row of value) if (row && typeof row === "object") collect(row as Record<string, unknown>)
      }
    }
  }
  if (keys.size) rows.forEach(collect)
  return [...ids].sort((a, b) => a - b)
}

/** همه‌ی فیلدهای تعریف، با اقلام گروه‌ها. */
const allFields = (definition: FormDefinition) => definition.sections.flatMap((s) => s.fields).flatMap((f) => [f, ...itemsOf(f)])

/** نام‌های شناسه‌های به‌کاررفته در این ثبت‌ها (فقط آنچه فرم لازم دارد بارگیری می‌شود). */
export function useNames(definition: FormDefinition | undefined, rows: Record<string, unknown>[]): Names {
  const fields = React.useMemo(() => (definition ? allFields(definition) : []), [definition])
  const userIds = React.useMemo(() => idsOf(fields.filter((f) => f.type === "user"), rows), [fields, rows])
  const users = useUserNames(userIds).data
  // شناسه‌های ارجاع، به تفکیک منبع
  const recordIds = React.useMemo(() => {
    const bySource = new Map<string, FieldDef[]>()
    for (const f of fields.filter((f) => f.type === "record")) bySource.set(String(f.props?.source ?? ""), [...(bySource.get(String(f.props?.source ?? "")) ?? []), f])
    return [...bySource.entries()].map(([source, fs]) => ({ source, ids: idsOf(fs, rows) })).filter((x) => x.ids.length > 0)
  }, [fields, rows])
  const recordData = useQueries({
    queries: recordIds.map(({ source, ids }) => ({
      queryKey: ["forms", "record-names", source, ids.join(",")],
      queryFn: () => unwrap(api.GET("/api/forms/record-lookup/", { params: { query: { source, ids: ids.join(",") } } })),
      staleTime: 60_000,
    })),
  })
  const recordKey = recordData.map((q) => q.dataUpdatedAt).join()
  const records = React.useMemo(
    () => new Map(recordIds.flatMap(({ source }, i) => (recordData[i]?.data ?? []).map((r) => [`${source}#${r.id}`, recordLabel(r)] as const))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- نتیجه‌ی useQueries در هر رندر آرایه‌ی تازه است؛ زمان به‌روزرسانی کافی است
    [recordIds, recordKey]
  )
  const units = useUnitOptions()
  const positions = usePositionNames()
  const listCodes = React.useMemo(() => [...new Set(fields.filter((f) => f.type === "lookup").map((f) => String(f.props?.list ?? "")))], [fields])
  const lookupData = useQueries({
    queries: listCodes.map((code) => ({
      queryKey: ["lookup-items", code],
      queryFn: () => unwrap(api.GET("/api/lookups/items/", { params: { query: { list: code, is_active: "true" } } })),
      staleTime: 5 * 60_000,
    })),
  })
  const lookupKey = lookupData.map((q) => q.dataUpdatedAt).join()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- نتیجه‌ی useQueries در هر رندر آرایه‌ی تازه است؛ زمان به‌روزرسانی کافی است
  const lookups = React.useMemo(() => new Map(listCodes.map((code, i) => [code, new Map((lookupData[i]?.data ?? []).map((item) => [item.code, item.title]))])), [listCodes, lookupKey])
  return React.useMemo(
    () => ({
      users: new Map((users ?? []).map((u) => [u.id, u.full_name])),
      units: new Map(units.map((u) => [u.value, u.label])),
      positions: new Map((positions ?? []).map((p) => [p.id, p.title])),
      lookups,
      records,
    }),
    [users, units, positions, lookups, records]
  )
}
