// قاب مشترک فرم هر بخش تنظیمات: بارگذاری، خلاصه‌ی خطا، دکمه‌های ذخیره/بازگردانی و هشدار تغییرهای ذخیره‌نشده.
import type * as React from "react"
import type { UseQueryResult } from "@tanstack/react-query"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import { RotateCcw, Save } from "lucide-react"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormGrid } from "@/components/form/form-grid"
import { UnsavedChangesGuard } from "@/components/form/unsaved-changes-guard"
import { Section } from "@/components/layout/section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, type Schemas } from "@/lib/api/client"

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

type Props<T extends FieldValues, O extends FieldValues> = {
  section: SectionInfo
  form: UseFormReturn<T, unknown, O>
  labels: Partial<Record<keyof T & string, string>>
  onSubmit: (e: React.FormEvent) => void
  saving: boolean
  children: React.ReactNode
}

export function SettingsForm<T extends FieldValues, O extends FieldValues>({ section, form, labels, onSubmit, saving, children }: Props<T, O>) {
  const dirty = form.formState.isDirty
  return (
    <form onSubmit={onSubmit} noValidate>
      <Section
        title={section.title}
        description={section.description}
        footer={
          <>
            <Button type="submit" disabled={saving || !dirty}>
              {saving ? <Spinner /> : <Save />}
              {saving ? "در حال ذخیره…" : "ذخیره‌ی تغییرات"}
            </Button>
            <Button type="button" variant="ghost" disabled={saving || !dirty} onClick={() => form.reset()}>
              <RotateCcw /> بازگردانی
            </Button>
            {dirty && !saving && <span className="text-2xs text-muted-foreground">تغییرهای ذخیره‌نشده دارید.</span>}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ErrorSummary errors={form.formState.errors} labels={labels} submitCount={form.formState.submitCount} />
          <FormGrid>{children}</FormGrid>
        </div>
      </Section>
      <UnsavedChangesGuard when={dirty && !saving} />
    </form>
  )
}
