import * as React from "react"
import { Controller, type Control, type ControllerRenderProps, type FieldPath, type FieldValues } from "react-hook-form"
import { InfoTip } from "@/components/info-tip"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"

type FieldLayout = "side" | "stacked"

type RenderArgs<TValues extends FieldValues, TName extends FieldPath<TValues>> = {
  field: ControllerRenderProps<TValues, TName>
  id: string
  invalid: boolean
  /** ویژگی‌های دسترس‌پذیری که باید روی کنترل (یا گروه) گذاشته شود. */
  aria: { "aria-invalid": boolean; "aria-describedby"?: string; "aria-required"?: boolean; "aria-labelledby"?: string }
}

type Props<TValues extends FieldValues, TName extends FieldPath<TValues>> = {
  control: Control<TValues>
  name: TName
  label: string
  required?: boolean
  /** راهنمای فیلد: جمع‌شده در نشانه‌ی ⓘ کنار برچسب (صفحه‌خوان آن را همراه فیلد می‌خواند). */
  description?: React.ReactNode
  /** اطلاعات پویا یا ضروری که همیشه باید دیده شود (مثل شمار نویسه یا نتیجه‌ی محاسبه)، با متن کوچک زیر فیلد. */
  hint?: React.ReactNode
  /** side: برچسب کنار فیلد روی صفحه‌های بزرگ (سبک فرم‌های اداری)؛ stacked: برچسب بالای فیلد. */
  layout?: FieldLayout
  /**
   * گروه گزینه‌ها (چند چک‌باکس یا رادیو): برچسب به گروه با aria-labelledby وصل می‌شود، نه با for.
   * گروه باید id و tabIndex={-1} بگیرد تا پیوند خلاصه‌ی خطا به آن برسد.
   */
  group?: boolean
  className?: string
  render: (args: RenderArgs<TValues, TName>) => React.ReactNode
}

/** شناسه‌ی پایدار فیلد؛ خلاصه‌ی خطا با همین شناسه به فیلد پیوند می‌دهد. */
export const fieldId = (name: string) => `field-${name.replace(/\./g, "-")}`

/**
 * فیلد فرم: اتصال react-hook-form به Field شادسی‌اِن با برچسب، راهنمای جمع‌شده (ⓘ)، متن کمکی کوچک و خطای مشخص زیر فیلد.
 */
export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  label,
  required,
  description,
  hint,
  layout = "side",
  group,
  className,
  render,
}: Props<TValues, TName>) {
  const id = fieldId(name)
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = fieldState.invalid
        const describedBy = [description && `${id}-description`, hint && `${id}-hint`, invalid && `${id}-error`].filter(Boolean).join(" ") || undefined
        return (
          <Field
            data-invalid={invalid}
            className={cn(layout === "side" && "md:grid md:grid-cols-[8rem_minmax(0,1fr)] md:items-start md:gap-x-3", className)}
          >
            <div className={cn("flex items-start gap-1", layout === "side" && "md:min-h-7 md:pt-1")}>
              <FieldLabel htmlFor={group ? undefined : id} id={group ? `${id}-label` : undefined}>
                {label}
              </FieldLabel>
              {/* ستاره بیرون از برچسب: نام دسترس‌پذیر فیلد دقیقاً همان برچسب است (الزامی بودن با aria-required) */}
              {required && (
                <span className="-ms-0.5 text-xs/relaxed text-destructive" aria-hidden>
                  *
                </span>
              )}
              {description && (
                <>
                  <InfoTip label={`راهنمای ${label}`} className="-my-1">
                    {description}
                  </InfoTip>
                  <span id={`${id}-description`} className="sr-only">
                    {description}
                  </span>
                </>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              {render({
                field,
                id,
                invalid,
                aria: {
                  "aria-invalid": invalid,
                  "aria-describedby": describedBy,
                  "aria-required": required || undefined,
                  "aria-labelledby": group ? `${id}-label` : undefined,
                },
              })}
              {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
              <FieldError id={`${id}-error`} errors={[fieldState.error]} />
            </div>
          </Field>
        )
      }}
    />
  )
}

/**
 * فیلد فقط‌خواندنی با همان چیدمان FormField (برچسب کنار محتوا)، برای مقدارهایی که کاربر وارد نمی‌کند؛
 * مثل مشخصات ثبت‌کننده یا امضای ذخیره‌شده در فرم‌ساز.
 */
export function StaticField({ label, required, hint, layout = "side", className, children }: {
  label: string
  required?: boolean
  hint?: React.ReactNode
  layout?: FieldLayout
  className?: string
  children: React.ReactNode
}) {
  return (
    <Field role="group" aria-label={label} className={cn(layout === "side" && "md:grid md:grid-cols-[8rem_minmax(0,1fr)] md:items-start md:gap-x-3", className)}>
      <div className={cn("flex items-start gap-1", layout === "side" && "md:min-h-7 md:pt-1")}>
        <span className="text-xs/relaxed font-medium">{label}</span>
        {required && (
          <span className="-ms-0.5 text-xs/relaxed text-destructive" aria-hidden>
            *
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {children}
        {hint && <FieldDescription>{hint}</FieldDescription>}
      </div>
    </Field>
  )
}
