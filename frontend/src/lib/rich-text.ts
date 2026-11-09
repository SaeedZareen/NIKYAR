// ظاهر و ویژگی‌های مشترک نمایش و ویرایشگر متن قالب‌دار (components/rich-text.tsx).
import { cn } from "@/lib/utils"

/** ظاهر یکسان متن قالب‌دار در نمایش و ویرایشگر. */
export const richTextClass = cn(
  "text-xs/relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:ps-5 [&_ul]:list-disc [&_ul]:ps-5 [&_p:not(:last-child)]:mb-1.5",
  "[&_table]:my-1.5 [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium"
)

export type RichTextEditorProps = {
  id: string
  value: string
  onChange: (html: string) => void
  onBlur?: () => void
  /** برچسب ویرایشگر (aria-labelledby) */
  labelledBy?: string
  describedBy?: string
  invalid?: boolean
  required?: boolean
  disabled?: boolean
  /** جدول ساده در نوار ابزار */
  tables?: boolean
}

