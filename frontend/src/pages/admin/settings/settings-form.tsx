// قاب مشترک هر بخش تنظیمات: بارگذاری مقدارها و فرم بخش (SectionForm) با عنوان و راهنمای اعلام‌شده در سرور.
import type * as React from "react"
import type { UseQueryResult } from "@tanstack/react-query"
import type { FieldValues } from "react-hook-form"
import { SectionForm } from "@/components/form/section-form"
import { Section } from "@/components/layout/section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage, type Schemas } from "@/lib/api/client"
import { onlyDigits } from "@/lib/format"
import { cn } from "@/lib/utils"

export type SectionInfo = Schemas["SectionInfo"]

/** تا رسیدن مقدارهای بخش اسکلت، در خطا پیام با «تلاش دوباره»، سپس فرم. */
export function SettingsLoader<T>({ section, query, children }: { section: SectionInfo; query: UseQueryResult<T>; children: (data: T) => React.ReactNode }) {
  if (query.data) return children(query.data)
  return (
    <Section title={section.title} description={section.description}>
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>{errorMessage(query.error)}</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              تلاش دوباره
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div role="status" aria-label="در حال بارگذاری" className="grid gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
      )}
    </Section>
  )
}

type SettingsFormProps<T extends FieldValues, O extends FieldValues> = Omit<React.ComponentProps<typeof SectionForm<T, O>>, "title" | "description"> & { section: SectionInfo }

/** فرم یک بخش تنظیمات: عنوان و راهنما از اعلام بخش در سرور. */
export function SettingsForm<T extends FieldValues, O extends FieldValues>({ section, ...props }: SettingsFormProps<T, O>) {
  return <SectionForm title={section.title} description={section.description} {...props} />
}

type UnitInputProps = Omit<React.ComponentProps<typeof InputGroupInput>, "onChange" | "value"> & {
  value: string
  onChange: (value: string) => void
  unit: string
  /** بیشترین شمار رقم‌ها. */
  digits?: number
}

/** عدد صحیح با واحد کنار آن (روز، ساعت، بار…)؛ مقدار رشته‌ی رقمی است و فرم آن را عدد می‌کند. */
export function UnitInput({ value, onChange, unit, digits = 3, className, ...props }: UnitInputProps) {
  return (
    <InputGroup className={cn("max-w-40", className)}>
      <InputGroupInput
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        className="text-start tabular-nums"
        value={value}
        onChange={(e) => onChange(onlyDigits(e.target.value).slice(0, digits))}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
