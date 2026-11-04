// ساختار فرم؛ همان چیزی که بک‌اند در core/forms/validation.py اعتبارسنجی می‌کند
export type FieldType =
  | "text" | "textarea" | "password" | "number" | "amount" | "checkbox" | "select" | "multiselect" | "lookup" | "multilookup"
  | "date" | "time" | "national_id" | "mobile" | "phone" | "email" | "iban" | "card_number" | "postal_code"
  | "address" | "user" | "org_unit" | "file" | "table" | "heading" | "paragraph";

export type VisibleIf = { field: string; op: "eq" | "neq" | "filled" | "empty"; value?: string };

export type FieldDef = {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  readonly?: boolean;
  span?: number;
  help?: string;
  placeholder?: string;
  visibleIf?: VisibleIf | null;
  config?: {
    options?: { value: string; label: string }[];
    lookup?: string;
    min?: number | string; max?: number | string; decimal?: boolean;
    minLength?: number | string; maxLength?: number | string; pattern?: string; patternMessage?: string;
    maxFiles?: number | string; minRows?: number | string; maxRows?: number | string;
  };
  columns?: FieldDef[];
};

export type SectionDef = { id: string; title: string; description?: string; columns?: number; fields: FieldDef[] };
export type FormSchema = { sections: SectionDef[] };
export type Access = Record<string, "edit" | "read" | "hidden">;
export type Values = Record<string, unknown>;

export const DISPLAY_ONLY: FieldType[] = ["heading", "paragraph"];

export function isVisible(f: FieldDef, values: Values) {
  const c = f.visibleIf;
  if (!c || !c.field) return true;
  const actual = values[c.field];
  const empty = actual === undefined || actual === null || actual === "" || actual === false || (Array.isArray(actual) && actual.length === 0);
  switch (c.op) {
    case "eq": return typeof actual === "boolean" ? actual === (c.value === "true") : String(actual ?? "") === String(c.value ?? "");
    case "neq": return String(actual ?? "") !== String(c.value ?? "");
    case "filled": return !empty;
    case "empty": return empty;
    default: return true;
  }
}

export function allFields(schema: FormSchema): FieldDef[] {
  return schema.sections.flatMap((s) => s.fields);
}

export function dataFields(schema: FormSchema): FieldDef[] {
  return allFields(schema).filter((f) => !DISPLAY_ONLY.includes(f.type));
}

export function lookupCodes(schema: FormSchema): string[] {
  const out = new Set<string>();
  const walk = (fs: FieldDef[]) => fs.forEach((f) => {
    if ((f.type === "lookup" || f.type === "multilookup") && f.config?.lookup) out.add(f.config.lookup);
    if (f.columns) walk(f.columns);
  });
  schema.sections.forEach((s) => walk(s.fields));
  return [...out];
}
