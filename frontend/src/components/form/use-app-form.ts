import { useForm, type DefaultValues, type FieldValues } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"

/**
 * فرم استاندارد نیک‌یار: اعتبارسنجی zod، بررسی هر فیلد پس از ترک آن،
 * و پس از ارسال ناموفق فوکوس به «خلاصه‌ی خطا» می‌رود (نه به اولین فیلد).
 */
export function useAppForm<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
  defaultValues: DefaultValues<TInput>
) {
  return useForm<TInput, unknown, TOutput>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onTouched",
    shouldFocusError: false,
  })
}
