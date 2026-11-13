import type { Control, FieldValues, Path, UseFormReturn } from "react-hook-form"
import { useLookupItems } from "@/app/lookups"
import { FormField } from "@/components/form/form-field"
import { DigitsInput, IbanInput, JalaliDateInput } from "@/components/form/inputs"
import { SingleFileInput } from "@/components/files"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { bankFromIban } from "@/lib/banks"

// ─── فیلدهای مشترک پانل‌های سوابق ───────────────────────────────────────

type F<V extends FieldValues> = { form: UseFormReturn<V, unknown, FieldValues>; name: Path<V>; label: string; required?: boolean; description?: string }
/** فرم‌های سوابق خروجی تبدیل‌شده (zod) دارند؛ FormField فقط کنترل ورودی را لازم دارد. */
const ctl = <V extends FieldValues>(form: UseFormReturn<V, unknown, FieldValues>) => form.control as unknown as Control<V>

export function TextField<V extends FieldValues>({ form, name, label, required, description }: F<V>) {
  return <FormField control={ctl(form)} name={name} label={label} required={required} description={description} render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
}

export function NumberField<V extends FieldValues>({ form, name, label, required, description }: F<V>) {
  return (
    <FormField
      control={ctl(form)}
      name={name}
      label={label}
      required={required}
      description={description}
      render={({ field, id, aria }) => <Input id={id} dir="ltr" inputMode="decimal" className="text-start tabular-nums" {...field} {...aria} />}
    />
  )
}

export function DateField<V extends FieldValues>({ form, name, label, required }: F<V>) {
  return (
    <FormField
      control={ctl(form)}
      name={name}
      label={label}
      required={required}
      render={({ field, id, aria }) => <JalaliDateInput id={id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...aria} />}
    />
  )
}

export function LookupField<V extends FieldValues>({ form, name, label, list, required }: F<V> & { list: string }) {
  const items = useLookupItems(list).data ?? []
  return (
    <FormField
      control={ctl(form)}
      name={name}
      label={label}
      required={required}
      render={({ field, id, aria }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={id} className="w-full" {...aria}>
            <SelectValue placeholder="انتخاب کنید" />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.id} value={String(i.id)}>
                {i.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )
}

export function SwitchField<V extends FieldValues>({ form, name, label, on, off, description }: F<V> & { on: string; off: string }) {
  return (
    <FormField
      control={ctl(form)}
      name={name}
      label={label}
      description={description}
      render={({ field, id }) => (
        <div className="flex min-h-7 items-center gap-2">
          <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
          <span className="text-xs text-muted-foreground">{field.value ? on : off}</span>
        </div>
      )}
    />
  )
}

export function FileField<V extends FieldValues>({ form, name, label }: F<V>) {
  return (
    <FormField
      control={ctl(form)}
      name={name}
      label={label}
      render={({ field, id, aria }) => <SingleFileInput id={id} value={field.value} onChange={field.onChange} camera {...aria} />}
    />
  )
}

export function DigitsField<V extends FieldValues>({ form, name, label, kind }: F<V> & { kind: "nationalId" | "cardNumber" }) {
  return <FormField control={ctl(form)} name={name} label={label} render={({ field, id, aria }) => <DigitsInput kind={kind} id={id} {...field} {...aria} />} />
}

/** شبا با نام بانک (از کد بانک) زیر فیلد. */
export function IbanField<V extends FieldValues>({ form, name, label, required }: F<V>) {
  return (
    <FormField
      control={ctl(form)}
      name={name}
      label={label}
      required={required}
      hint={bankFromIban(form.watch(name) ?? "")}
      render={({ field, id, aria }) => <IbanInput id={id} {...field} {...aria} />}
    />
  )
}
