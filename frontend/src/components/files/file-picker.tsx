import * as React from "react"
import { FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatFileSize } from "@/lib/format"
import { FileIcon } from "./file-icon"

type Props = {
  id?: string
  value: File | null
  onChange: (file: File | null) => void
  accept?: string
  disabled?: boolean
  /** متن دکمه، مثل «انتخاب فایل پشتیبان». */
  label?: string
} & Pick<React.AriaAttributes, "aria-describedby" | "aria-invalid">

/**
 * انتخاب یک فایل از رایانه بدون بارگذاری فوری (برای فایل لایسنس یا پشتیبان که مستقیم به API خودشان می‌روند).
 * جایگزین input فایل مرورگر که متن انگلیسی («Choose File») دارد.
 */
export function FilePicker({ id, value, onChange, accept, disabled, label = "انتخاب فایل", ...aria }: Props) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-2">
      <Button id={id} type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()} {...aria}>
        <FileUp /> {label}
      </Button>
      {value ? (
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <FileIcon name={value.name} />
          <bdi className="truncate">{value.name}</bdi>
          <span className="text-2xs text-muted-foreground">({formatFileSize(value.size)})</span>
        </span>
      ) : (
        <span className="text-2xs text-muted-foreground">فایلی انتخاب نشده است.</span>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null)
          e.target.value = ""
        }}
      />
    </div>
  )
}
