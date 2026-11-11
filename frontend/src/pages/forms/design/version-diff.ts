// مقایسه‌ی دو نسخه‌ی فرم: چه فیلدها و بخش‌هایی افزوده، حذف یا تغییر کرده‌اند (به زبان طراح، نه JSON).
import { itemsOf, type FieldDef, type FormDefinition, type SectionDef } from "@/components/form-renderer/definition"
import { toFaDigits } from "@/lib/format"

export type Change = { kind: "added" | "removed" | "changed"; id: string; label: string; details: string[] }
type VersionDiff = { form: string[]; sections: Change[]; fields: Change[] }

/** where: نام جا برای نمایش؛ place: شناسه‌ی بخش یا گروه برای مقایسه (تغییر عنوان بخش جابه‌جایی نیست) */
type Located = { field: FieldDef; where: string; place: string }

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const yesNo = (v: unknown) => (v ? "بله" : "خیر")
const quoted = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : `«${typeof v === "string" ? v : JSON.stringify(v)}»`)

function fieldsOf(def: FormDefinition): Map<string, Located> {
  const found = new Map<string, Located>()
  for (const s of def.sections) {
    const section = s.title || "بی‌عنوان"
    for (const f of s.fields) {
      found.set(f.id, { field: f, where: `بخش «${section}»`, place: `section:${s.id}` })
      for (const item of itemsOf(f)) found.set(item.id, { field: item, where: `گروه «${f.label ?? f.id}»`, place: `group:${f.id}` })
    }
  }
  return found
}

const fieldName = (f: FieldDef) => f.label || (f.type === "paragraph" ? "متن راهنما" : f.type === "divider" ? "جداکننده" : f.id)

const CONDITIONS = { visible_if: "شرط نمایش", required_if: "شرط الزام", readonly_if: "شرط فقط‌خواندنی" } as const

/** تفاوت‌های یک فیلد؛ propTitle نام فارسی هر ویژگی نوع (از کاتالوگ). */
function fieldChanges(a: Located, b: Located, propTitle: (type: string, name: string) => string): string[] {
  const x = a.field
  const y = b.field
  const out: string[] = []
  if (x.type !== y.type) out.push(`نوع تغییر کرد`)
  if ((x.label ?? "") !== (y.label ?? "")) out.push(`برچسب: ${quoted(x.label)} ← ${quoted(y.label)}`)
  if (!!x.required !== !!y.required) out.push(`الزامی: ${yesNo(x.required)} ← ${yesNo(y.required)}`)
  if (!!x.readonly !== !!y.readonly) out.push(`فقط‌خواندنی: ${yesNo(x.readonly)} ← ${yesNo(y.readonly)}`)
  if (!!x.unique !== !!y.unique) out.push(`مقدار یکتا: ${yesNo(x.unique)} ← ${yesNo(y.unique)}`)
  if ((x.help ?? "") !== (y.help ?? "")) out.push("راهنما تغییر کرد")
  if (!same(x.default, y.default)) out.push(`مقدار پیش‌فرض: ${quoted(x.default)} ← ${quoted(y.default)}`)
  if (!same(x.prefill, y.prefill)) out.push("پیش‌پر تغییر کرد")
  for (const [key, title] of Object.entries(CONDITIONS) as [keyof typeof CONDITIONS, string][]) {
    if (!same(x[key], y[key])) out.push(x[key] === undefined ? `${title} افزوده شد` : y[key] === undefined ? `${title} برداشته شد` : `${title} تغییر کرد`)
  }
  if ((x.span ?? 1) !== (y.span ?? 1) || !!x.new_row !== !!y.new_row) out.push("چیدمان (پهنا یا ردیف) تغییر کرد")
  if (a.place !== b.place) out.push(`جا: ${a.where} ← ${b.where}`)
  if (x.type === y.type) {
    const px = x.props ?? {}
    const py = y.props ?? {}
    const names = [...new Set([...Object.keys(px), ...Object.keys(py)])].filter((n) => n !== "columns" && !same(px[n], py[n]))
    if (names.length) out.push(`ویژگی‌ها: ${names.map((n) => propTitle(x.type, n)).join("، ")}`)
  }
  return out
}

function sectionChanges(x: SectionDef, y: SectionDef): string[] {
  const out: string[] = []
  if ((x.title ?? "") !== (y.title ?? "")) out.push(`عنوان: ${quoted(x.title)} ← ${quoted(y.title)}`)
  if ((x.columns ?? 1) !== (y.columns ?? 1)) out.push(`ستون‌ها: ${toFaDigits(x.columns ?? 1)} ← ${toFaDigits(y.columns ?? 1)}`)
  if ((x.labels ?? "auto") !== (y.labels ?? "auto")) out.push("جای برچسب‌ها تغییر کرد")
  if ((x.help ?? "") !== (y.help ?? "")) out.push("راهنما تغییر کرد")
  if (!same(x.visible_if, y.visible_if)) out.push("شرط نمایش تغییر کرد")
  return out
}

/** تفاوت نسخه‌ی from با نسخه‌ی to. */
export function diffDefinitions(from: FormDefinition, to: FormDefinition, propTitle: (type: string, name: string) => string = (_t, n) => n): VersionDiff {
  const form: string[] = []
  if (!!from.steps !== !!to.steps) form.push(`نمایش مرحله‌ای: ${yesNo(from.steps)} ← ${yesNo(to.steps)}`)
  if (!same(from.rules ?? [], to.rules ?? [])) form.push(`اعتبارسنجی بین فیلدها تغییر کرد (${toFaDigits(from.rules?.length ?? 0)} ← ${toFaDigits(to.rules?.length ?? 0)} قاعده)`)

  const sections: Change[] = []
  const before = new Map(from.sections.map((s) => [s.id, s]))
  const after = new Map(to.sections.map((s) => [s.id, s]))
  for (const s of to.sections) {
    const old = before.get(s.id)
    if (!old) sections.push({ kind: "added", id: s.id, label: s.title || "بی‌عنوان", details: [] })
    else {
      const details = sectionChanges(old, s)
      if (details.length) sections.push({ kind: "changed", id: s.id, label: s.title || "بی‌عنوان", details })
    }
  }
  for (const s of from.sections) if (!after.has(s.id)) sections.push({ kind: "removed", id: s.id, label: s.title || "بی‌عنوان", details: [] })
  if (from.sections.map((s) => s.id).join() !== to.sections.map((s) => s.id).filter((id) => before.has(id)).join() && sections.every((c) => c.kind !== "removed"))
    form.push("ترتیب بخش‌ها تغییر کرد")

  const fields: Change[] = []
  const a = fieldsOf(from)
  const b = fieldsOf(to)
  for (const [id, y] of b) {
    const x = a.get(id)
    if (!x) fields.push({ kind: "added", id, label: fieldName(y.field), details: [y.where] })
    else {
      const details = fieldChanges(x, y, propTitle)
      if (details.length) fields.push({ kind: "changed", id, label: fieldName(y.field), details })
    }
  }
  for (const [id, x] of a) if (!b.has(id)) fields.push({ kind: "removed", id, label: fieldName(x.field), details: [x.where] })
  return { form, sections, fields }
}

export const isEmptyDiff = (d: VersionDiff) => !d.form.length && !d.sections.length && !d.fields.length
