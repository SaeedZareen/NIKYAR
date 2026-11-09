import * as React from "react"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TableKit } from "@tiptap/extension-table"
import { Bold, Italic, Link2, List, ListOrdered, Quote, Redo2, Table2, Trash2, Underline, Undo2, Unlink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { richTextClass, type RichTextEditorProps } from "@/lib/rich-text"

// ویرایشگر Tiptap با همان برچسب‌هایی که سرور نگه می‌دارد (core/forms/html.py)؛ فقط با React.lazy بارگذاری می‌شود.

export default function RichTextEditorImpl({ id, value, onChange, onBlur, labelledBy, describedBy, invalid, required, disabled, tables = true }: RichTextEditorProps) {
  const wrapper = React.useRef<HTMLDivElement>(null)
  // آخرین مقداری که خود ویرایشگر فرستاده یا گرفته؛ فقط مقدار واقعاً تازه‌ی بیرونی جایگزین محتوا می‌شود
  const known = React.useRef(value)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false, horizontalRule: false, heading: { levels: [3, 4] }, link: { openOnClick: false, autolink: true } }),
      ...(tables ? [TableKit.configure({ table: { resizable: false } })] : []),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(required ? { "aria-required": "true" } : {}),
        class: cn(richTextClass, "min-h-24 px-2.5 py-2 outline-none"),
      },
    },
    onUpdate: ({ editor }) => {
      known.current = editor.isEmpty ? "" : editor.getHTML()
      onChange(known.current)
    },
    onBlur: () => onBlur?.(),
  })

  // مقدار بیرونی (مثلاً بازگشت پیش‌نویس) وقتی کاربر در حال نوشتن نیست
  React.useEffect(() => {
    if (!editor || !editor.isInitialized || value === known.current) return
    known.current = value
    editor.commands.setContent(value || "", { emitUpdate: false })
  }, [editor, value])

  // غیرفعال با disabled یا fieldset غیرفعال (فقط‌خواندنی شرطی)؛ contenteditable از fieldset پیروی نمی‌کند.
  React.useEffect(() => {
    if (!editor || !editor.isInitialized) return
    const off = disabled || !!wrapper.current?.closest("fieldset:disabled")
    if (editor.isEditable === off) editor.setEditable(!off, false)
  })

  return (
    <div
      ref={wrapper}
      className={cn(
        "rounded-md border border-input bg-input/20 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        invalid && "border-destructive ring-destructive/20",
        disabled && "opacity-60"
      )}
    >
      {editor && <Toolbar editor={editor} tables={tables} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor, tables }: { editor: Editor; tables: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      editable: e.isEditable,
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  })
  const [linking, setLinking] = React.useState(false)
  const [href, setHref] = React.useState("")
  const chain = () => editor.chain().focus()
  const tool = (label: string, icon: React.ReactNode, run: () => void, pressed?: boolean, enabled = true) => (
    <Button type="button" variant={pressed ? "secondary" : "ghost"} size="icon-sm" aria-label={label} aria-pressed={pressed} disabled={!state.editable || !enabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {icon}
    </Button>
  )
  const applyLink = () => {
    const url = href.trim()
    if (url) chain().extendMarkRange("link").setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run()
    setLinking(false)
  }
  return (
    <div className="flex flex-col border-b">
      <div role="toolbar" aria-label="قالب‌بندی متن" className="flex flex-wrap items-center gap-0.5 p-1">
        {tool("پررنگ", <Bold />, () => chain().toggleBold().run(), state.bold)}
        {tool("کج", <Italic />, () => chain().toggleItalic().run(), state.italic)}
        {tool("زیرخط", <Underline />, () => chain().toggleUnderline().run(), state.underline)}
        {tool("فهرست نقطه‌ای", <List />, () => chain().toggleBulletList().run(), state.bullet)}
        {tool("فهرست شماره‌دار", <ListOrdered />, () => chain().toggleOrderedList().run(), state.ordered)}
        {tool("نقل‌قول", <Quote />, () => chain().toggleBlockquote().run(), state.quote)}
        {tool("پیوند", <Link2 />, () => {
          setHref(String(editor.getAttributes("link").href ?? ""))
          setLinking((v) => !v)
        }, state.link || linking)}
        {state.link && tool("برداشتن پیوند", <Unlink />, () => chain().extendMarkRange("link").unsetLink().run())}
        {tables && tool("جدول", <Table2 />, () => chain().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run(), false, !state.table)}
        {tables && state.table && (
          <>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-2xs" disabled={!state.editable} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addRowAfter().run()}>
              + ردیف
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-2xs" disabled={!state.editable} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addColumnAfter().run()}>
              + ستون
            </Button>
            {tool("حذف جدول", <Trash2 />, () => chain().deleteTable().run())}
          </>
        )}
        <span className="ms-auto flex gap-0.5">
          {tool("واگرد", <Undo2 />, () => chain().undo().run(), false, state.undo)}
          {tool("ازنو", <Redo2 />, () => chain().redo().run(), false, state.redo)}
        </span>
      </div>
      {linking && (
        <div className="flex items-center gap-1.5 border-t p-1.5">
          <Input
            dir="ltr"
            aria-label="نشانی پیوند"
            placeholder="https://"
            className="h-7 text-start"
            value={href}
            autoFocus
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                applyLink()
              }
              if (e.key === "Escape") setLinking(false)
            }}
          />
          <Button type="button" size="sm" onClick={applyLink}>
            ثبت پیوند
          </Button>
        </div>
      )}
    </div>
  )
}
