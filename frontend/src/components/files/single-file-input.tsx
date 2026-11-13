import { useFileInfo } from "@/lib/files"
import { AttachmentList } from "./attachment-list"
import { FileDropzone } from "./file-dropzone"

type Props = {
  id?: string
  /** شناسه‌ی فایل؛ رشته‌ی خالی یعنی بدون فایل. */
  value: string
  onChange: (fileId: string) => void
  camera?: boolean
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

/** یک فایل (مثل تصویر مدرک): ناحیه‌ی بارگذاری، یا فایل فعلی با پیش‌نمایش، دانلود و برداشتن. */
export function SingleFileInput({ id, value, onChange, camera, ...aria }: Props) {
  const info = useFileInfo(value ? [value] : [])
  if (!value) return <FileDropzone id={id} camera={camera} onUploaded={(f) => onChange(f.id)} {...aria} />
  return <AttachmentList files={info.data ?? []} onRemove={async () => onChange("")} />
}
