import {
  AlignRight, AtSign, Banknote, Calendar, CheckSquare, Clock, CreditCard, FileText, Hash, Heading, IdCard, Landmark,
  List, ListChecks, ListTree, Mail, MapPin, Paperclip, Phone, Smartphone, Table2, Type, UserRound, Building, Pilcrow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FieldDef, FieldType } from "../types";

export type CatalogItem = { type: FieldType; title: string; group: string; icon: LucideIcon };

export const CATALOG: CatalogItem[] = [
  { type: "text", title: "متن کوتاه", group: "پایه", icon: Type },
  { type: "textarea", title: "متن چندخطی", group: "پایه", icon: AlignRight },
  { type: "number", title: "عدد", group: "پایه", icon: Hash },
  { type: "amount", title: "مبلغ (تومان)", group: "پایه", icon: Banknote },
  { type: "checkbox", title: "بله/خیر", group: "پایه", icon: CheckSquare },
  { type: "select", title: "انتخاب از گزینه‌ها", group: "انتخابی", icon: List },
  { type: "multiselect", title: "چندانتخابی", group: "انتخابی", icon: ListChecks },
  { type: "lookup", title: "از فهرست پایه", group: "انتخابی", icon: ListTree },
  { type: "multilookup", title: "چندانتخابی از فهرست پایه", group: "انتخابی", icon: ListTree },
  { type: "date", title: "تاریخ شمسی", group: "زمان", icon: Calendar },
  { type: "time", title: "ساعت", group: "زمان", icon: Clock },
  { type: "national_id", title: "کد ملی", group: "ایرانی", icon: IdCard },
  { type: "mobile", title: "موبایل", group: "ایرانی", icon: Smartphone },
  { type: "phone", title: "تلفن ثابت", group: "ایرانی", icon: Phone },
  { type: "email", title: "ایمیل", group: "ایرانی", icon: Mail },
  { type: "iban", title: "شماره شبا", group: "ایرانی", icon: Landmark },
  { type: "card_number", title: "شماره کارت", group: "ایرانی", icon: CreditCard },
  { type: "postal_code", title: "کد پستی", group: "ایرانی", icon: AtSign },
  { type: "address", title: "استان و شهر", group: "ایرانی", icon: MapPin },
  { type: "user", title: "انتخاب کاربر", group: "سازمانی", icon: UserRound },
  { type: "org_unit", title: "واحد سازمانی", group: "سازمانی", icon: Building },
  { type: "file", title: "پیوست فایل", group: "پیشرفته", icon: Paperclip },
  { type: "table", title: "جدول چندردیفی", group: "پیشرفته", icon: Table2 },
  { type: "heading", title: "عنوان بخش", group: "نمایشی", icon: Heading },
  { type: "paragraph", title: "متن راهنما", group: "نمایشی", icon: Pilcrow },
];

export const catalogOf = (t: FieldType) => CATALOG.find((c) => c.type === t) ?? { type: t, title: t, group: "", icon: FileText };

export function newField(type: FieldType, used: Set<string>): FieldDef {
  let n = 1;
  while (used.has(`field_${n}`)) n++;
  const base: FieldDef = { key: `field_${n}`, type, label: catalogOf(type).title, span: 1 };
  if (type === "select" || type === "multiselect") base.config = { options: [{ value: "opt1", label: "گزینه‌ی ۱" }, { value: "opt2", label: "گزینه‌ی ۲" }] };
  if (type === "table") {
    base.span = 4;
    base.columns = [{ key: "title", type: "text", label: "شرح", required: true }, { key: "qty", type: "number", label: "تعداد" }];
  }
  if (type === "textarea" || type === "address" || type === "heading" || type === "paragraph") base.span = 4;
  if (type === "heading") base.label = "عنوان";
  if (type === "paragraph") base.label = "متن راهنما برای کاربر";
  return base;
}

export function usedKeys(fields: FieldDef[]): Set<string> {
  return new Set(fields.map((f) => f.key));
}
