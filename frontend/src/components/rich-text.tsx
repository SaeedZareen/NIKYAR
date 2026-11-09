import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { richTextClass, type RichTextEditorProps } from "@/lib/rich-text"
import { cn } from "@/lib/utils"

// متن قالب‌دار: نمایش HTML پاک‌سازی‌شده‌ی سرور (core/forms/html.py) و ویرایشگر (فقط وقتی لازم است بارگذاری می‌شود).

/** متن قالب‌دار؛ متن ساده‌ی قدیمی (بدون برچسب HTML) با همان شکستن سطرها. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (!html.trimStart().startsWith("<")) return <p className={cn("text-xs whitespace-pre-line", className)}>{html}</p>
  // HTML را سرور پاک‌سازی کرده یا خروجی همین ویرایشگر (با طرح بسته‌ی Tiptap) است.
  return <div className={cn(richTextClass, className)} dangerouslySetInnerHTML={{ __html: html }} />
}

const Editor = React.lazy(() => import("./rich-text-editor"))

/** ویرایشگر متن قالب‌دار (پررنگ، کج، زیرخط، فهرست، پیوند، نقل‌قول، جدول ساده). */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <React.Suspense fallback={<Skeleton className="h-28 w-full" />}>
      <Editor {...props} />
    </React.Suspense>
  )
}
