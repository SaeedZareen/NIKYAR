import * as React from "react"
import { Controller, type Control, type ControllerRenderProps, type FieldPath, type FieldValues } from "react-hook-form"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"

export type FieldLayout = "side" | "stacked"

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
  description?: React.ReactNode
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
 * فیلد فرم: اتصال react-hook-form به Field شادسی‌اِن با برچسب، توضیح و خطای مشخص زیر فیلد.
 */
export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  label,
  required,
  description,
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
        const describedBy = [description && `${id}-description`, invalid && `${id}-error`].filter(Boolean).join(" ") || undefined
        return (
          <Field
            data-invalid={invalid}
            className={cn(layout === "side" && "md:grid md:grid-cols-[8rem_minmax(0,1fr)] md:items-start md:gap-x-3", className)}
          >
            <FieldLabel
              htmlFor={group ? undefined : id}
              id={group ? `${id}-label` : undefined}
              className={cn(layout === "side" && "md:min-h-7 md:pt-1")}
            >
              <span>
                {label}
                {required && (
                  <span className="ms-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                )}
              </span>
            </FieldLabel>
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
              {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
              <FieldError id={`${id}-error`} errors={[fieldState.error]} />
            </div>
          </Field>
        )
      }}
    />
  )
}
