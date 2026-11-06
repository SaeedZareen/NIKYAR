import * as React from "react"
import { RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FileDropzone } from "./file-dropzone"

type Props = {
  id?: string
  /** شناسه‌ی فایل تصویر؛ رشته‌ی خالی یعنی بدون تصویر. */
  value: string
  onChange: (fileId: string) => void
  /** متن جایگزین تصویر برای صفحه‌خوان، مثل «لوگوی سازمان». */
  alt: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

/** فیلد تصویر تکی (لوگو، امضا): پیش‌نمایش تصویر فعلی با جایگزینی و حذف، یا ناحیه‌ی بارگذاری. */
export function ImageInput({ id, value, onChange, alt, ...aria }: Props) {
  const [replacing, setReplacing] = React.useState(false)
  const upload = (
    <FileDropzone
      id={id}
      imagesOnly
      onUploaded={(f) => {
        setReplacing(false)
        onChange(f.id)
      }}
      {...aria}
    />
  )
  if (!value) return upload
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <img src={`/api/files/${value}/download/?inline=1`} alt={alt} className="h-16 max-w-48 rounded-md border bg-background object-contain p-1" />
        <div className="flex gap-2">
          <Button id={replacing ? undefined : id} type="button" variant="outline" size="sm" onClick={() => setReplacing((r) => !r)} aria-expanded={replacing}>
            <RefreshCw /> {replacing ? "انصراف" : "جایگزینی"}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange("")}>
            <Trash2 /> حذف تصویر
          </Button>
        </div>
      </div>
      {replacing && upload}
    </div>
  )
}
