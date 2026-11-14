import { useForm, type DefaultValues, type FieldValues } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"

/**
 * فرم استاندارد نیک‌یار: اعتبارسنجی zod، بررسی هر فیلد پس از ترک آن،
 * و پس از ارسال ناموفق فوکوس به «خلاصه‌ی خطا» می‌رود (نه به اولین فیلد).
 * validateOn: "submit" برای فرم ورود: فیلد خالیِ با فوکوس خودکار با رفتن به پیوندی دیگر خطا نمی‌دهد.
 */
export function useAppForm<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
  defaultValues: DefaultValues<TInput>,
  { validateOn = "touch" }: { validateOn?: "touch" | "submit" } = {}
) {
  return useForm<TInput, unknown, TOutput>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: validateOn === "submit" ? "onSubmit" : "onTouched",
    shouldFocusError: false,
  })
}
