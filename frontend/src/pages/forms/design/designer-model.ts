// مدل طراح فرم: تغییرهای خالص روی تعریف فرم (افزودن، جابه‌جایی، حذف، بلوک‌ها) و تاریخچه‌ی واگرد/ازنو.
// شکل تعریف همان است که موتور سرور می‌سنجد (backend/core/forms/engine.py).
import type { FieldDef, FieldType, FormDefinition, SectionDef } from "@/components/form-renderer/definition"
import type { Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"

export type FieldTypeSpec = Schemas["FieldTypeSpec"]

/** شناسه‌ی یکتای تازه با پیشوند نوع: text_1، text_2… */
export function uniqueId(base: string, taken: Set<string>): string {
  const prefix = base.replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "") || "field"
  let n = 1
  while (taken.has(`${prefix}_${n}`)) n++
  const id = `${prefix}_${n}`
  taken.add(id)
  return id
}

export const allIds = (def: FormDefinition) => new Set(def.sections.flatMap((s) => [s.id, ...s.fields.map((f) => f.id)]))

const options = (prefix: string, labels: string[]) => labels.map((label, i) => ({ value: `${prefix}_${i + 1}`, label }))

/** مقدار پیش‌فرض ویژگی‌های الزامی هر نوع، تا فیلد تازه همیشه تعریف درستی داشته باشد (و ذخیره‌ی خودکار رد نشود). */
const REQUIRED_DEFAULTS: Partial<Record<FieldType, Record<string, unknown>>> = {
  paragraph: { content: "متن راهنما را اینجا بنویسید." },
  choice: { options: options("opt", ["گزینه‌ی ۱", "گزینه‌ی ۲"]) },
  multi_choice: { options: options("opt", ["گزینه‌ی ۱", "گزینه‌ی ۲", "گزینه‌ی ۳"]) },
  lookup: { list: "form-category" },
  matrix: {
    rows: options("row", ["معیار ۱", "معیار ۲"]),
    columns: [
      { value: "1", label: "ضعیف" },
      { value: "2", label: "متوسط" },
      { value: "3", label: "خوب" },
      { value: "4", label: "عالی" },
    ],
  },
  consent: { text: "صحت اطلاعات بالا را تأیید می‌کنم." },
}

/** فیلد تازه از یک نوع کاتالوگ با برچسب و ویژگی‌های الزامی پیش‌فرض. */
export function newField(spec: Pick<FieldTypeSpec, "code" | "title" | "label_required">, taken: Set<string>, label?: string): FieldDef {
  const field: FieldDef = { id: uniqueId(spec.code, taken), type: spec.code as FieldType }
  if (spec.label_required || spec.code === "heading") field.label = label ?? spec.title
  const props = REQUIRED_DEFAULTS[spec.code as FieldType]
  if (props) field.props = structuredClone(props)
  return field
}

type BlockField = Omit<FieldDef, "id"> & { key: string }
export type Block = { key: string; title: string; fields: BlockField[] }

/** بلوک‌های آماده: گروه فیلدهای پرتکرار؛ پس از افزودن مثل فیلدهای عادی قابل تغییرند. */
export const BLOCKS: Block[] = [
  {
    key: "personal",
    title: "مشخصات فردی",
    fields: [
      { key: "first_name", type: "text", label: "نام", required: true, props: { script: "persian", max_length: 50 } },
      { key: "last_name", type: "text", label: "نام خانوادگی", required: true, props: { script: "persian", max_length: 80 } },
      { key: "national_code", type: "national_code", label: "کد ملی", required: true },
      { key: "birth_date", type: "date", label: "تاریخ تولد", props: { range: "past" } },
      { key: "gender", type: "lookup", label: "جنسیت", props: { list: "gender" } },
    ],
  },
  {
    key: "contact",
    title: "اطلاعات تماس",
    fields: [
      { key: "mobile", type: "mobile", label: "موبایل", required: true },
      { key: "phone", type: "phone", label: "تلفن ثابت" },
      { key: "email", type: "email", label: "ایمیل" },
    ],
  },
  {
    key: "address",
    title: "نشانی",
    fields: [
      { key: "region", type: "region", label: "استان و شهر" },
      { key: "postal_code", type: "postal_code", label: "کد پستی" },
      { key: "address", type: "textarea", label: "نشانی", span: 3, props: { max_length: 500, rows: 2 } },
    ],
  },
  {
    key: "bank",
    title: "حساب بانکی",
    fields: [
      { key: "account_holder", type: "text", label: "نام صاحب حساب", props: { script: "persian" } },
      { key: "iban", type: "iban", label: "شماره‌ی شبا", required: true },
      { key: "card_number", type: "card_number", label: "شماره‌ی کارت" },
    ],
  },
]

export function blockFields(block: Block, taken: Set<string>): FieldDef[] {
  return block.fields.map(({ key, ...f }) => ({ ...structuredClone(f), id: uniqueId(key, taken) }))
}

// ─── یافتن و تغییر ──────────────────────────────────────────────────────

export function locate(def: FormDefinition, fieldId: string): { section: number; index: number } | null {
  for (const [s, section] of def.sections.entries()) {
    const index = section.fields.findIndex((f) => f.id === fieldId)
    if (index >= 0) return { section: s, index }
  }
  return null
}

const withSections = (def: FormDefinition, sections: SectionDef[]): FormDefinition => ({ ...def, sections })

/** درج فیلدها در بخش sectionId در جای index (پیش‌فرض: انتها). */
export function insertFields(def: FormDefinition, sectionId: string, fields: FieldDef[], index?: number): FormDefinition {
  return withSections(
    def,
    def.sections.map((s) => {
      if (s.id !== sectionId) return s
      const at = index === undefined ? s.fields.length : Math.max(0, Math.min(index, s.fields.length))
      return { ...s, fields: [...s.fields.slice(0, at), ...fields, ...s.fields.slice(at)] }
    })
  )
}

/** جابه‌جایی فیلد به بخش دیگر یا جای دیگر همان بخش (index در بخش مقصد پس از برداشتن فیلد). */
export function moveField(def: FormDefinition, fieldId: string, toSectionId: string, toIndex: number): FormDefinition {
  const from = locate(def, fieldId)
  if (!from) return def
  const field = def.sections[from.section].fields[from.index]
  const removed = withSections(
    def,
    def.sections.map((s, i) => (i === from.section ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s))
  )
  return insertFields(removed, toSectionId, [field], toIndex)
}

/** یک خانه بالا یا پایین در همان بخش؛ در لبه‌ی بخش به بخش قبلی یا بعدی می‌رود. */
export function nudgeField(def: FormDefinition, fieldId: string, delta: -1 | 1): FormDefinition {
  const at = locate(def, fieldId)
  if (!at) return def
  const section = def.sections[at.section]
  const target = at.index + delta
  if (target >= 0 && target < section.fields.length) return moveField(def, fieldId, section.id, target)
  const next = def.sections[at.section + delta]
  if (!next) return def
  return moveField(def, fieldId, next.id, delta < 0 ? next.fields.length : 0)
}

export function updateField(def: FormDefinition, fieldId: string, change: (f: FieldDef) => FieldDef): FormDefinition {
  return withSections(
    def,
    def.sections.map((s) => ({ ...s, fields: s.fields.map((f) => (f.id === fieldId ? change(f) : f)) }))
  )
}

export function removeField(def: FormDefinition, fieldId: string): FormDefinition {
  return withSections(
    def,
    def.sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== fieldId) }))
  )
}

/** رونوشت فیلد درست پس از خودش، با شناسه‌ی تازه. */
export function duplicateField(def: FormDefinition, fieldId: string): { def: FormDefinition; id: string } {
  const at = locate(def, fieldId)
  if (!at) return { def, id: fieldId }
  const original = def.sections[at.section].fields[at.index]
  const copy = { ...structuredClone(original), id: uniqueId(original.type, allIds(def)) }
  return { def: insertFields(def, def.sections[at.section].id, [copy], at.index + 1), id: copy.id }
}

export function addSection(def: FormDefinition): { def: FormDefinition; id: string } {
  const id = uniqueId("section", allIds(def))
  return { def: withSections(def, [...def.sections, { id, title: `بخش ${toFaDigits(def.sections.length + 1)}`, columns: 2, fields: [] }]), id }
}

export function updateSection(def: FormDefinition, sectionId: string, change: (s: SectionDef) => SectionDef): FormDefinition {
  return withSections(
    def,
    def.sections.map((s) => (s.id === sectionId ? change(s) : s))
  )
}

export function removeSection(def: FormDefinition, sectionId: string): FormDefinition {
  return withSections(
    def,
    def.sections.filter((s) => s.id !== sectionId)
  )
}

export function moveSection(def: FormDefinition, sectionId: string, delta: -1 | 1): FormDefinition {
  const i = def.sections.findIndex((s) => s.id === sectionId)
  const j = i + delta
  if (i < 0 || j < 0 || j >= def.sections.length) return def
  const sections = [...def.sections]
  ;[sections[i], sections[j]] = [sections[j], sections[i]]
  return withSections(def, sections)
}

/** پهنای فیلدها هرگز از ستون‌های بخش بیشتر نیست (مثلاً پس از کم کردن ستون‌ها یا افزودن بلوک). */
export function fitSpans(def: FormDefinition): FormDefinition {
  let changed = false
  const sections = def.sections.map((s) => {
    const columns = s.columns ?? 1
    const fields = s.fields.map((f) => {
      if (f.span === undefined || f.span <= columns) return f
      changed = true
      return columns === 1 ? (({ span: _span, ...rest }) => rest)(f) : { ...f, span: columns }
    })
    return { ...s, fields }
  })
  return changed ? withSections(def, sections) : def
}

/** تعریف خالی با یک بخش آماده، تا طراح از جای خالی شروع نکند. */
export function ensureSection(def: FormDefinition): FormDefinition {
  return def.sections.length ? def : { ...def, sections: [{ id: "section_1", title: "مشخصات", columns: 2, fields: [] }] }
}

// ─── تاریخچه ─────────────────────────────────────────────────────────────

export type History = { past: FormDefinition[]; present: FormDefinition; future: FormDefinition[]; key?: string; at?: number }

const LIMIT = 100
const MERGE_MS = 1000

/**
 * ثبت تغییر در تاریخچه. تغییرهای پیاپی یک ویژگی (مثل تایپ برچسب) با key یکسان در کمتر از یک ثانیه
 * یک قدم واگرد حساب می‌شوند.
 */
export function commit(h: History, next: FormDefinition, key?: string, now = Date.now()): History {
  if (next === h.present) return h
  if (key && key === h.key && h.at && now - h.at < MERGE_MS) return { ...h, present: next, future: [], at: now }
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [], key, at: now }
}

export function undo(h: History): History {
  if (!h.past.length) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (!h.future.length) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

/** خطاهای سرور («sections.0.fields.2.props.max») به تفکیک فیلد یا بخش: {شناسه: {مسیر باقی‌مانده: پیام}}. */
export function errorsByItem(def: FormDefinition, fields: Record<string, string>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const [path, message] of Object.entries(fields)) {
    const m = /^sections\.(\d+)(?:\.fields\.(\d+))?\.?(.*)$/.exec(path)
    const section = m ? def.sections[Number(m[1])] : undefined
    const field = m?.[2] !== undefined ? section?.fields[Number(m[2])] : undefined
    const owner = field?.id ?? section?.id ?? "form"
    ;(out[owner] ??= {})[m ? m[3] : path] = message
  }
  return out
}
