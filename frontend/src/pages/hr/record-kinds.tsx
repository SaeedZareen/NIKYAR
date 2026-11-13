import { z } from "zod"
import { columnHelper } from "@/components/data-table"
import { StatusBadge } from "@/components/status-badge"
import { bankFromIban } from "@/lib/banks"
import { type Schemas } from "@/lib/api/client"
import { formatDate, toFaDigits } from "@/lib/format"
import { schemas } from "@/lib/validators"
import { DateField, DigitsField, FileField, IbanField, LookupField, NumberField, SwitchField, TextField } from "./record-fields"
import type { RecordConfig } from "./record-section"

// ─── کمک‌های ستون و مقدار ───────────────────────────────────────────────

const digits = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : <span className="tabular-nums">{toFaDigits(String(v))}</span>)
const date = (v: string | null | undefined) => (v ? <span className="tabular-nums">{formatDate(v)}</span> : "—")
const optionalDate = schemas.jalaliDate
const toNull = (v: string) => (v ? v : null)
const optionalNumber = (label: string, max?: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (!Number.isNaN(Number(v)) && (max === undefined || Number(v) <= max)), `«${label}» باید عدد${max !== undefined ? ` تا ${toFaDigits(max)}` : ""} باشد.`)

// ─── تحصیلات ─────────────────────────────────────────────────────────────

type Education = Schemas["Education"]
const education = columnHelper<Education>()
const educationSchema = z.object({
  level: schemas.required("مقطع"),
  field: z.string(),
  institution: z.string(),
  graduation_year: optionalNumber("سال دانش‌آموختگی", 1500),
  gpa: optionalNumber("معدل", 20),
  certificate: z.string(),
})
export const EDUCATION: RecordConfig<Education, z.input<typeof educationSchema>, z.output<typeof educationSchema>> = {
  kind: "educations",
  title: "تحصیلات",
  noun: "سابقه‌ی تحصیلی",
  empty: "سابقه‌ی تحصیلی ثبت نشده است",
  columns: [
    education.accessor("level_title", { header: "مقطع", meta: { label: "مقطع", primary: true } }),
    education.accessor("field", { header: "رشته", meta: { label: "رشته", wrap: true }, cell: (c) => c.getValue() || "—" }),
    education.accessor("institution", { header: "دانشگاه یا مؤسسه", meta: { label: "دانشگاه یا مؤسسه", wrap: true }, cell: (c) => c.getValue() || "—" }),
    education.accessor("graduation_year", { header: "سال دانش‌آموختگی", meta: { label: "سال دانش‌آموختگی" }, cell: (c) => digits(c.getValue()) }),
    education.accessor("gpa", { header: "معدل", meta: { label: "معدل" }, cell: (c) => digits(c.getValue()) }),
    education.accessor("certificate", { header: "مدرک", enableSorting: false, meta: { label: "مدرک" }, cell: (c) => (c.getValue() ? "پیوست دارد" : "—") }),
  ],
  schema: educationSchema,
  defaults: (r) => ({
    level: r ? String(r.level) : "",
    field: r?.field ?? "",
    institution: r?.institution ?? "",
    graduation_year: r?.graduation_year ? String(r.graduation_year) : "",
    gpa: r?.gpa ?? "",
    certificate: r?.certificate ?? "",
  }),
  fields: (form) => (
    <>
      <LookupField form={form} name="level" label="مقطع" list="education-level" required />
      <TextField form={form} name="field" label="رشته" />
      <TextField form={form} name="institution" label="دانشگاه یا مؤسسه" />
      <NumberField form={form} name="graduation_year" label="سال دانش‌آموختگی" description="سال شمسی، مثل ۱۳۹۸." />
      <NumberField form={form} name="gpa" label="معدل" />
      <FileField form={form} name="certificate" label="تصویر مدرک" />
    </>
  ),
  toBody: (v) => ({ ...v, level: Number(v.level), graduation_year: v.graduation_year ? Number(v.graduation_year) : null, gpa: v.gpa || null }),
  labels: { level: "مقطع", field: "رشته", institution: "دانشگاه یا مؤسسه", graduation_year: "سال دانش‌آموختگی", gpa: "معدل", certificate: "تصویر مدرک" },
}

// ─── سوابق کاری ──────────────────────────────────────────────────────────

type Work = Schemas["WorkHistory"]
const work = columnHelper<Work>()
const workSchema = z.object({
  employer: schemas.required("محل کار"),
  title: z.string(),
  start_date: schemas.required("از تاریخ").pipe(schemas.jalaliDate),
  end_date: optionalDate,
  leave_reason: z.string(),
})
export const WORK: RecordConfig<Work, z.input<typeof workSchema>, z.output<typeof workSchema>> = {
  kind: "work-history",
  title: "سوابق کاری",
  description: "سوابق کاری پیش از استخدام در این سازمان.",
  noun: "سابقه‌ی کاری",
  empty: "سابقه‌ی کاری ثبت نشده است",
  columns: [
    work.accessor("employer", { header: "محل کار", meta: { label: "محل کار", primary: true, wrap: true } }),
    work.accessor("title", { header: "سمت", meta: { label: "سمت" }, cell: (c) => c.getValue() || "—" }),
    work.accessor("start_date", { header: "از تاریخ", meta: { label: "از تاریخ" }, cell: (c) => date(c.getValue()) }),
    work.accessor("end_date", { header: "تا تاریخ", meta: { label: "تا تاریخ" }, cell: (c) => date(c.getValue()) }),
    work.accessor("leave_reason", { header: "علت ترک کار", meta: { label: "علت ترک کار", wrap: true }, cell: (c) => c.getValue() || "—" }),
  ],
  schema: workSchema,
  defaults: (r) => ({ employer: r?.employer ?? "", title: r?.title ?? "", start_date: r?.start_date ?? "", end_date: r?.end_date ?? "", leave_reason: r?.leave_reason ?? "" }),
  fields: (form) => (
    <>
      <TextField form={form} name="employer" label="محل کار" required />
      <TextField form={form} name="title" label="سمت" />
      <DateField form={form} name="start_date" label="از تاریخ" required />
      <DateField form={form} name="end_date" label="تا تاریخ" />
      <TextField form={form} name="leave_reason" label="علت ترک کار" />
    </>
  ),
  toBody: (v) => ({ ...v, end_date: toNull(v.end_date) }),
  labels: { employer: "محل کار", title: "سمت", start_date: "از تاریخ", end_date: "تا تاریخ", leave_reason: "علت ترک کار" },
}

// ─── افراد تحت تکفل ──────────────────────────────────────────────────────

type Dependent = Schemas["Dependent"]
const dependent = columnHelper<Dependent>()
const dependentSchema = z.object({
  first_name: schemas.required("نام"),
  last_name: schemas.required("نام خانوادگی"),
  relation: schemas.required("نسبت"),
  national_code: z.union([z.literal(""), schemas.nationalId]),
  birth_date: optionalDate,
  insured: z.boolean(),
})
export const DEPENDENTS: RecordConfig<Dependent, z.input<typeof dependentSchema>, z.output<typeof dependentSchema>> = {
  kind: "dependents",
  title: "افراد تحت تکفل",
  noun: "فرد تحت تکفل",
  empty: "فرد تحت تکفلی ثبت نشده است",
  columns: [
    dependent.accessor((d) => `${d.first_name} ${d.last_name}`, { id: "name", header: "نام", meta: { label: "نام", primary: true } }),
    dependent.accessor("relation_title", { header: "نسبت", meta: { label: "نسبت" } }),
    dependent.accessor("national_code", { header: "کد ملی", meta: { label: "کد ملی" }, cell: (c) => digits(c.getValue()) }),
    dependent.accessor("birth_date", { header: "تاریخ تولد", meta: { label: "تاریخ تولد" }, cell: (c) => date(c.getValue()) }),
    dependent.accessor("insured", {
      header: "بیمه",
      meta: { label: "بیمه", exportValue: (d) => (d.insured ? "تحت پوشش" : "") },
      cell: (c) => (c.getValue() ? <StatusBadge tone="success">تحت پوشش</StatusBadge> : "—"),
    }),
  ],
  schema: dependentSchema,
  defaults: (r) => ({
    first_name: r?.first_name ?? "",
    last_name: r?.last_name ?? "",
    relation: r ? String(r.relation) : "",
    national_code: r?.national_code ?? "",
    birth_date: r?.birth_date ?? "",
    insured: r?.insured ?? false,
  }),
  fields: (form) => (
    <>
      <TextField form={form} name="first_name" label="نام" required />
      <TextField form={form} name="last_name" label="نام خانوادگی" required />
      <LookupField form={form} name="relation" label="نسبت" list="dependent-relation" required />
      <DigitsField form={form} name="national_code" label="کد ملی" kind="nationalId" />
      <DateField form={form} name="birth_date" label="تاریخ تولد" />
      <SwitchField form={form} name="insured" label="بیمه" on="تحت پوشش بیمه‌ی کارمند" off="تحت پوشش نیست" />
    </>
  ),
  toBody: (v) => ({ ...v, relation: Number(v.relation), birth_date: toNull(v.birth_date) }),
  labels: { first_name: "نام", last_name: "نام خانوادگی", relation: "نسبت", national_code: "کد ملی", birth_date: "تاریخ تولد", insured: "بیمه" },
}

// ─── حساب‌های بانکی ──────────────────────────────────────────────────────

type Bank = Schemas["BankAccount"]
const bank = columnHelper<Bank>()
const bankSchema = z.object({
  iban: schemas.iban,
  account_number: z.string(),
  card_number: z.union([z.literal(""), schemas.cardNumber]),
  is_salary: z.boolean(),
})
export const BANK: RecordConfig<Bank, z.input<typeof bankSchema>, z.output<typeof bankSchema>> = {
  kind: "bank-accounts",
  title: "حساب‌های بانکی",
  noun: "حساب بانکی",
  empty: "حساب بانکی ثبت نشده است",
  columns: [
    bank.accessor((b) => bankFromIban(b.iban) ?? "—", { id: "bank", header: "بانک", meta: { label: "بانک", primary: true } }),
    bank.accessor("iban", { header: "شماره‌ی شبا", meta: { label: "شماره‌ی شبا" }, cell: (c) => <bdi dir="ltr" className="tabular-nums">{c.getValue()}</bdi> }),
    bank.accessor("card_number", { header: "شماره‌ی کارت", meta: { label: "شماره‌ی کارت" }, cell: (c) => digits(c.getValue()) }),
    bank.accessor("is_salary", {
      header: "حقوق",
      meta: { label: "حقوق", exportValue: (b) => (b.is_salary ? "حساب حقوق" : "") },
      cell: (c) => (c.getValue() ? <StatusBadge tone="info">حساب حقوق</StatusBadge> : "—"),
    }),
  ],
  schema: bankSchema,
  defaults: (r) => ({ iban: r?.iban ?? "", account_number: r?.account_number ?? "", card_number: r?.card_number ?? "", is_salary: r?.is_salary ?? false }),
  fields: (form) => (
    <>
      <IbanField form={form} name="iban" label="شماره‌ی شبا" required />
      <TextField form={form} name="account_number" label="شماره‌ی حساب" />
      <DigitsField form={form} name="card_number" label="شماره‌ی کارت" kind="cardNumber" />
      <SwitchField form={form} name="is_salary" label="حساب حقوق" on="حقوق به این حساب واریز می‌شود" off="حساب دیگر" description="هر پرونده یک حساب حقوق دارد؛ انتخاب این حساب، حساب حقوق قبلی را برمی‌دارد." />
    </>
  ),
  toBody: (v) => v,
  labels: { iban: "شماره‌ی شبا", account_number: "شماره‌ی حساب", card_number: "شماره‌ی کارت", is_salary: "حساب حقوق" },
}

// ─── بیمه ────────────────────────────────────────────────────────────────

type Insurance = Schemas["Insurance"]
const insurance = columnHelper<Insurance>()
const insuranceSchema = z.object({
  kind: schemas.required("نوع بیمه"),
  number: z.string(),
  start_date: optionalDate,
  end_date: optionalDate,
  prior_months: optionalNumber("سابقه‌ی پیشین (ماه)"),
})
export const INSURANCE: RecordConfig<Insurance, z.input<typeof insuranceSchema>, z.output<typeof insuranceSchema>> = {
  kind: "insurances",
  title: "بیمه",
  noun: "بیمه",
  empty: "بیمه‌ای ثبت نشده است",
  columns: [
    insurance.accessor("kind_title", { header: "نوع بیمه", meta: { label: "نوع بیمه", primary: true } }),
    insurance.accessor("number", { header: "شماره‌ی بیمه", meta: { label: "شماره‌ی بیمه" }, cell: (c) => digits(c.getValue()) }),
    insurance.accessor("start_date", { header: "از تاریخ", meta: { label: "از تاریخ" }, cell: (c) => date(c.getValue()) }),
    insurance.accessor("end_date", { header: "تا تاریخ", meta: { label: "تا تاریخ" }, cell: (c) => date(c.getValue()) }),
    insurance.accessor("prior_months", { header: "سابقه‌ی پیشین (ماه)", meta: { label: "سابقه‌ی پیشین (ماه)" }, cell: (c) => digits(c.getValue()) }),
  ],
  schema: insuranceSchema,
  defaults: (r) => ({
    kind: r ? String(r.kind) : "",
    number: r?.number ?? "",
    start_date: r?.start_date ?? "",
    end_date: r?.end_date ?? "",
    prior_months: r?.prior_months ? String(r.prior_months) : "",
  }),
  fields: (form) => (
    <>
      <LookupField form={form} name="kind" label="نوع بیمه" list="insurance-type" required />
      <TextField form={form} name="number" label="شماره‌ی بیمه" />
      <DateField form={form} name="start_date" label="از تاریخ" />
      <DateField form={form} name="end_date" label="تا تاریخ" />
      <NumberField form={form} name="prior_months" label="سابقه‌ی پیشین (ماه)" description="ماه‌های بیمه‌ی پیش از این سازمان." />
    </>
  ),
  toBody: (v) => ({ ...v, kind: Number(v.kind), start_date: toNull(v.start_date), end_date: toNull(v.end_date), prior_months: v.prior_months ? Number(v.prior_months) : null }),
  labels: { kind: "نوع بیمه", number: "شماره‌ی بیمه", start_date: "از تاریخ", end_date: "تا تاریخ", prior_months: "سابقه‌ی پیشین (ماه)" },
}

// ─── مدارک ───────────────────────────────────────────────────────────────

type Doc = Schemas["Document"]
const doc = columnHelper<Doc>()
const docSchema = z.object({
  kind: schemas.required("نوع مدرک"),
  number: z.string(),
  issue_date: optionalDate,
  expiry_date: optionalDate,
  file: z.string(),
  note: z.string(),
})
export const DOCUMENTS: RecordConfig<Doc, z.input<typeof docSchema>, z.output<typeof docSchema>> = {
  kind: "documents",
  title: "مدارک",
  noun: "مدرک",
  empty: "مدرکی ثبت نشده است",
  columns: [
    doc.accessor("kind_title", { header: "نوع مدرک", meta: { label: "نوع مدرک", primary: true } }),
    doc.accessor("number", { header: "شماره", meta: { label: "شماره" }, cell: (c) => digits(c.getValue()) }),
    doc.accessor("issue_date", { header: "تاریخ صدور", meta: { label: "تاریخ صدور" }, cell: (c) => date(c.getValue()) }),
    doc.accessor("expiry_date", {
      header: "تاریخ اعتبار",
      meta: { label: "تاریخ اعتبار" },
      cell: (c) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          {date(c.getValue())}
          {c.row.original.expired && <StatusBadge tone="destructive">منقضی</StatusBadge>}
        </span>
      ),
    }),
    doc.accessor("file", { header: "فایل", enableSorting: false, meta: { label: "فایل" }, cell: (c) => (c.getValue() ? "پیوست دارد" : "—") }),
    doc.accessor("note", { header: "توضیح", meta: { label: "توضیح", wrap: true }, cell: (c) => c.getValue() || "—" }),
  ],
  schema: docSchema,
  defaults: (r) => ({
    kind: r ? String(r.kind) : "",
    number: r?.number ?? "",
    issue_date: r?.issue_date ?? "",
    expiry_date: r?.expiry_date ?? "",
    file: r?.file ?? "",
    note: r?.note ?? "",
  }),
  fields: (form) => (
    <>
      <LookupField form={form} name="kind" label="نوع مدرک" list="document-type" required />
      <TextField form={form} name="number" label="شماره" />
      <DateField form={form} name="issue_date" label="تاریخ صدور" />
      <DateField form={form} name="expiry_date" label="تاریخ اعتبار" />
      <FileField form={form} name="file" label="فایل" />
      <TextField form={form} name="note" label="توضیح" />
    </>
  ),
  toBody: (v) => ({ ...v, kind: Number(v.kind), issue_date: toNull(v.issue_date), expiry_date: toNull(v.expiry_date) }),
  labels: { kind: "نوع مدرک", number: "شماره", issue_date: "تاریخ صدور", expiry_date: "تاریخ اعتبار", file: "فایل", note: "توضیح" },
}
