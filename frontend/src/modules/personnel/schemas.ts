// بخش‌های پرونده‌ی پرسنلی به‌صورت «اسکیمای فرم» تعریف شده‌اند تا با همان FormRenderer
// فرم‌ساز نمایش داده شوند. کلیدها دقیقاً نام فیلدهای API هستند.
import type { FieldDef, FormSchema } from "@/core/forms/types";

const L = (key: string, label: string, lookup: string, extra: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label, type: "lookup", config: { lookup }, ...extra });

export const identitySchema: FormSchema = {
  sections: [{
    id: "identity", title: "مشخصات هویتی", columns: 3, fields: [
      { key: "first_name", type: "text", label: "نام", required: true },
      { key: "last_name", type: "text", label: "نام خانوادگی", required: true },
      { key: "father_name", type: "text", label: "نام پدر" },
      { key: "national_id", type: "national_id", label: "کد ملی", required: true },
      { key: "birth_cert_no", type: "text", label: "شماره شناسنامه" },
      { key: "birth_cert_place", type: "text", label: "محل صدور" },
      { key: "birth_date", type: "date", label: "تاریخ تولد" },
      { key: "birth_place", type: "text", label: "محل تولد" },
      L("gender", "جنسیت", "gender", { required: true }),
      L("marital_status", "وضعیت تأهل", "marital_status"),
      L("military_status", "وضعیت نظام وظیفه", "military_status", { visibleIf: { field: "gender", op: "eq", value: "male" }, required: true, help: "فقط برای آقایان" }),
      L("nationality", "ملیت", "nationality"),
      L("religion", "دین", "religion"),
    ],
  }],
};

export const contactSchema: FormSchema = {
  sections: [{
    id: "contact", title: "اطلاعات تماس و نشانی", columns: 3, fields: [
      { key: "mobile", type: "mobile", label: "موبایل" },
      { key: "phone", type: "phone", label: "تلفن ثابت" },
      { key: "email", type: "email", label: "ایمیل" },
      { key: "location", type: "address", label: "استان و شهر", span: 2 },
      { key: "postal_code", type: "postal_code", label: "کد پستی" },
      { key: "address", type: "textarea", label: "نشانی کامل", span: 3 },
      { key: "emergency_name", type: "text", label: "نام تماس اضطراری" },
      { key: "emergency_phone", type: "phone", label: "تلفن تماس اضطراری" },
    ],
  }],
};

export function employmentSchema(positions: { value: string; label: string }[]): FormSchema {
  return {
    sections: [{
      id: "employment", title: "اطلاعات استخدامی", columns: 3, fields: [
        L("employment_status", "وضعیت اشتغال", "employment_status", { required: true }),
        L("employment_type", "نوع استخدام", "employment_type"),
        { key: "hire_date", type: "date", label: "تاریخ استخدام" },
        { key: "leave_date", type: "date", label: "تاریخ ترک کار", visibleIf: { field: "employment_status", op: "neq", value: "active" } },
        { key: "org_unit", type: "org_unit", label: "واحد سازمانی" },
        { key: "position", type: "select", label: "سمت سازمانی", config: { options: positions } },
        { key: "job_title", type: "text", label: "عنوان شغل" },
        L("insurance_type", "نوع بیمه", "insurance_type"),
        { key: "insurance_no", type: "text", label: "شماره بیمه" },
        { key: "user", type: "user", label: "حساب کاربری متصل", help: "برای ورود پرسنل به سامانه و انتساب کارها" },
        { key: "notes", type: "textarea", label: "یادداشت", span: 3 },
      ],
    }],
  };
}

export type ChildDef = {
  key: string; title: string; endpoint: string; sensitive?: boolean; schema: FormSchema;
  columns: { key: string; label: string }[]; empty: string;
};

export const CHILDREN: ChildDef[] = [
  {
    key: "educations", title: "تحصیلات", endpoint: "/personnel/educations/", empty: "مدرک تحصیلی ثبت نشده است.",
    columns: [{ key: "degree_title", label: "مقطع" }, { key: "field_of_study_title", label: "رشته" }, { key: "university", label: "محل تحصیل" }, { key: "graduation_year", label: "سال فراغت" }, { key: "is_highest", label: "آخرین مدرک" }],
    schema: { sections: [{ id: "e", title: "مدرک تحصیلی", columns: 2, fields: [
      L("degree", "مقطع", "education_degree", { required: true }), L("field_of_study", "رشته", "field_of_study"),
      { key: "university", type: "text", label: "محل تحصیل" }, { key: "gpa", type: "number", label: "معدل", config: { min: 0, max: 20, decimal: true } },
      { key: "graduation_year", type: "number", label: "سال فراغت", config: { min: 1300, max: 1500 } },
      { key: "is_highest", type: "checkbox", label: "آخرین مدرک تحصیلی" },
    ] }] },
  },
  {
    key: "work_history", title: "سوابق کاری", endpoint: "/personnel/work-history/", empty: "سابقه‌ی کاری ثبت نشده است.",
    columns: [{ key: "company", label: "سازمان" }, { key: "title", label: "سمت" }, { key: "start_date", label: "از" }, { key: "end_date", label: "تا" }, { key: "leave_reason_title", label: "علت ترک" }],
    schema: { sections: [{ id: "w", title: "سابقه‌ی کاری", columns: 2, fields: [
      { key: "company", type: "text", label: "نام سازمان", required: true }, { key: "title", type: "text", label: "سمت" },
      { key: "start_date", type: "date", label: "از تاریخ" }, { key: "end_date", type: "date", label: "تا تاریخ" },
      L("leave_reason", "علت ترک", "leave_reason"), { key: "insured", type: "checkbox", label: "سابقه‌ی بیمه دارد" },
    ] }] },
  },
  {
    key: "dependents", title: "افراد تحت تکفل", endpoint: "/personnel/dependents/", empty: "فرد تحت تکفلی ثبت نشده است.",
    columns: [{ key: "first_name", label: "نام" }, { key: "last_name", label: "نام خانوادگی" }, { key: "relation_title", label: "نسبت" }, { key: "national_id", label: "کد ملی" }, { key: "is_insured", label: "بیمه" }],
    schema: { sections: [{ id: "d", title: "فرد تحت تکفل", columns: 2, fields: [
      { key: "first_name", type: "text", label: "نام", required: true }, { key: "last_name", type: "text", label: "نام خانوادگی", required: true },
      L("relation", "نسبت", "dependent_relation", { required: true, help: "«همسر» فقط برای پرسنل متأهل قابل ثبت است." }),
      { key: "national_id", type: "national_id", label: "کد ملی" }, { key: "birth_date", type: "date", label: "تاریخ تولد" },
      { key: "is_insured", type: "checkbox", label: "تحت پوشش بیمه" },
    ] }] },
  },
  {
    key: "bank_accounts", title: "حساب‌های بانکی", endpoint: "/personnel/bank-accounts/", sensitive: true, empty: "حساب بانکی ثبت نشده است.",
    columns: [{ key: "bank_title", label: "بانک" }, { key: "iban", label: "شبا" }, { key: "card_number", label: "کارت" }, { key: "is_primary", label: "حساب اصلی" }],
    schema: { sections: [{ id: "b", title: "حساب بانکی", columns: 2, fields: [
      L("bank", "بانک", "bank", { required: true }), { key: "iban", type: "iban", label: "شماره شبا", required: true },
      { key: "card_number", type: "card_number", label: "شماره کارت" }, { key: "account_no", type: "text", label: "شماره حساب" },
      { key: "is_primary", type: "checkbox", label: "حساب اصلی (واریز حقوق)" },
    ] }] },
  },
  {
    key: "documents", title: "مدارک", endpoint: "/personnel/documents/", sensitive: true, empty: "مدرکی بارگذاری نشده است.",
    columns: [{ key: "doc_type_title", label: "نوع" }, { key: "title", label: "عنوان" }, { key: "attachment_name", label: "فایل" }, { key: "expires_on", label: "انقضا" }],
    schema: { sections: [{ id: "doc", title: "مدرک", columns: 2, fields: [
      L("doc_type", "نوع مدرک", "document_type", { required: true }), { key: "title", type: "text", label: "عنوان" },
      { key: "attachment", type: "file", label: "فایل", required: true, span: 2, config: { maxFiles: 1 } },
      { key: "expires_on", type: "date", label: "تاریخ انقضا" },
    ] }] },
  },
];
