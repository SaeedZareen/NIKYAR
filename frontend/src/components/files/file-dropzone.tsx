import * as React from "react"
import { Camera, Mic, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { allowedLabels, allowedTypes, type StoredFile } from "@/lib/files"
import { formatFileSize, toFaDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FileIcon } from "./file-icon"
import { useUploads } from "./use-uploads"

type Props = {
  id?: string
  multiple?: boolean
  /** فقط تصویر (مثل لوگو و امضا). */
  imagesOnly?: boolean
  /** محدودیت بیشتر نوع‌ها (مثلاً فیلد پیوست فرم‌ساز). */
  extensions?: string[]
  /** دکمه‌ی «عکس با دوربین» برای موبایل. */
  camera?: boolean
  /** دکمه‌ی «ضبط صدا» برای موبایل (ضبط‌کننده‌ی خود گوشی باز می‌شود). */
  record?: boolean
  disabled?: boolean
  onUploaded: (file: StoredFile) => void
  className?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

/**
 * ناحیه‌ی بارگذاری: کشیدن و رها کردن یا انتخاب فایل، بررسی نوع و حجم پیش از ارسال،
 * نوار پیشرفت و لغو هر فایل، و پیام خطای فارسی برای هر فایل ردشده.
 */
export function FileDropzone({ id, multiple, imagesOnly, extensions, camera, record, disabled, onUploaded, className, ...aria }: Props) {
  const input = React.useRef<HTMLInputElement>(null)
  const cameraInput = React.useRef<HTMLInputElement>(null)
  const recordInput = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const { policy, items, start, cancel, dismiss } = useUploads({ imagesOnly, extensions, onUploaded })
  const allowed = policy ? allowedTypes(policy, imagesOnly, extensions) : []
  const hintId = React.useId()

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (files.length) start(multiple ? files : files.slice(0, 1))
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) pick(e.dataTransfer.files)
        }}
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-4 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-input bg-muted/30",
          disabled && "opacity-60"
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs">
          {multiple ? "فایل‌ها را اینجا رها کنید یا" : "فایل را اینجا رها کنید یا"}{" "}
          <Button
            id={id}
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={disabled}
            onClick={() => input.current?.click()}
            aria-describedby={[hintId, aria["aria-describedby"]].filter(Boolean).join(" ")}
            aria-invalid={aria["aria-invalid"]}
          >
            {multiple ? "فایل‌ها را انتخاب کنید" : "فایل را انتخاب کنید"}
          </Button>
        </p>
        {camera && (
          <Button type="button" variant="outline" size="sm" className="mt-1 md:hidden" disabled={disabled} onClick={() => cameraInput.current?.click()}>
            <Camera /> عکس با دوربین
          </Button>
        )}
        {record && (
          <Button type="button" variant="outline" size="sm" className="mt-1 md:hidden" disabled={disabled} onClick={() => recordInput.current?.click()}>
            <Mic /> ضبط صدا
          </Button>
        )}
        <p id={hintId} className="text-2xs text-muted-foreground">
          {policy ? `${allowedLabels(allowed)} · حداکثر ${formatFileSize(policy.max_size)}` : " "}
        </p>
        <input
          ref={input}
          type="file"
          hidden
          multiple={multiple}
          accept={allowed.map((t) => `.${t.extension}`).join(",")}
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ""
          }}
        />
        {record && (
          <input
            ref={recordInput}
            type="file"
            hidden
            accept="audio/*"
            capture="user"
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ""
            }}
          />
        )}
        {camera && (
          <input
            ref={cameraInput}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ""
            }}
          />
        )}
      </div>

      {items.length > 0 && (
        <ul aria-label="فایل‌های در حال بارگذاری" className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
              <FileIcon name={item.name} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate" dir="auto">
                  {item.name}
                </span>
                {item.error ? (
                  <span role="alert" className="text-destructive">
                    {item.error}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Progress value={item.progress} aria-label={`پیشرفت بارگذاری ${item.name}`} className="flex-1" />
                    <span className="text-muted-foreground tabular-nums">{toFaDigits(item.progress)}٪</span>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={item.error ? `بستن پیام ${item.name}` : `لغو بارگذاری ${item.name}`}
                onClick={() => (item.error ? dismiss(item) : cancel(item))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
