import type * as React from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"
import { RotateCcw, Save } from "lucide-react"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormGrid } from "@/components/form/form-grid"
import { UnsavedChangesGuard } from "@/components/form/unsaved-changes-guard"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

type Props<T extends FieldValues, O extends FieldValues> = {
  title: string
  description?: React.ReactNode
  form: UseFormReturn<T, unknown, O>
  labels: Record<string, string>
  /** false: محتوا خودش چیدمان دارد (مثل جدول ساعت کاری) و در FormGrid قرار نمی‌گیرد. */
  grid?: boolean
  onSubmit: (e: React.FormEvent) => void
  saving: boolean
  children: React.ReactNode
}

/**
 * بخش فرم‌دار صفحه (تنظیمات، حساب من): Section با خلاصه‌ی خطا، دکمه‌های ذخیره/بازگردانی در پانویس
 * که فقط با تغییر فعال‌اند، و هشدار خروج با تغییرهای ذخیره‌نشده.
 */
export function SectionForm<T extends FieldValues, O extends FieldValues>({ title, description, form, labels, onSubmit, saving, grid = true, children }: Props<T, O>) {
  const dirty = form.formState.isDirty
  return (
    <form onSubmit={onSubmit} noValidate>
      <Section
        title={title}
        description={description}
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
          {grid ? <FormGrid>{children}</FormGrid> : children}
        </div>
      </Section>
      <UnsavedChangesGuard when={dirty && !saving} />
    </form>
  )
}
