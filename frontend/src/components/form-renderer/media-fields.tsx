import * as React from "react"
import { useWatch } from "react-hook-form"
import { Download, ExternalLink, LocateFixed, ScanLine, Trash2 } from "lucide-react"
import { FormField } from "@/components/form/form-field"
import { FileDropzone } from "@/components/files"
import { RichTextEditor, RichTextView } from "@/components/rich-text"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { fileUrl, inlineUrl, useFileInfo, type StoredFile } from "@/lib/files"
import { formatFileSize, formatNumber, toEnDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FieldDef } from "./definition"
import { asList, common, str, type FieldProps } from "./field-props"

// وب و رسانه (3.6b): پیوند، متن غنی، صدا، بارکد، موقعیت مکانی، و اجزای نمایشی تصویر و فایل راهنما.

const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*$/

export function UrlField(p: FieldProps) {
  const placeholder = str(p.field.props?.placeholder) || "https://"
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => {
        const value = str(field.value)
        return (
          <div className="flex items-center gap-1">
            <Input id={id} type="url" inputMode="url" dir="ltr" className="text-start" placeholder={placeholder} {...field} value={value} {...aria} />
            {URL_PATTERN.test(value.trim()) && (
              <Button asChild variant="ghost" size="icon-sm">
                <a href={value.trim()} target="_blank" rel="noopener noreferrer" aria-label={`باز کردن «${p.field.label}» در زبانه‌ی تازه`}>
                  <ExternalLink />
                </a>
              </Button>
            )}
          </div>
        )
      }}
    />
  )
}

export function RichTextField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      group
      render={({ field, id, aria }) => (
        <RichTextEditor
          id={id}
          value={str(field.value)}
          onChange={field.onChange}
          onBlur={field.onBlur}
          labelledBy={aria["aria-labelledby"]}
          describedBy={aria["aria-describedby"]}
          invalid={aria["aria-invalid"]}
          required={aria["aria-required"]}
        />
      )}
    />
  )
}

// ─── بارکد ───────────────────────────────────────────────────────────────

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorClass = new () => Detector

/** خواندن با دوربین فقط در مرورگرهایی که BarcodeDetector دارند و روی HTTPS. */
const detectorClass = (): DetectorClass | undefined =>
  typeof window !== "undefined" && window.isSecureContext && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector : undefined

export function BarcodeField(p: FieldProps) {
  const [scanning, setScanning] = React.useState(false)
  const camera = p.field.props?.camera !== false && !!detectorClass()
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => (
        <div className="flex items-center gap-1">
          {/* بارکدخوان‌ها مثل صفحه‌کلید تایپ می‌کنند؛ Enter پایانی فرم را ارسال نمی‌کند */}
          <Input
            id={id}
            dir="ltr"
            className="text-start"
            autoComplete="off"
            {...field}
            value={str(field.value)}
            onChange={(e) => field.onChange(toEnDigits(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            {...aria}
          />
          {camera && (
            <Button type="button" variant="outline" size="icon-sm" aria-label={`خواندن «${p.field.label}» با دوربین`} onClick={() => setScanning(true)}>
              <ScanLine />
            </Button>
          )}
          {scanning && (
            <ScanDialog
              title={p.field.label ?? ""}
              onClose={() => setScanning(false)}
              onRead={(v) => {
                field.onChange(v)
                setScanning(false)
              }}
            />
          )}
        </div>
      )}
    />
  )
}

function ScanDialog({ title, onRead, onClose }: { title: string; onRead: (value: string) => void; onClose: () => void }) {
  const video = React.useRef<HTMLVideoElement>(null)
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    const Detector = detectorClass()
    // وضعیت این اجرای اثر (دوربین و زمان‌سنج) تا هنگام بستن
    const run: { stream?: MediaStream; timer?: number; stopped: boolean } = { stopped: false }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (stream) => {
        run.stream = stream
        if (run.stopped || !video.current || !Detector) return
        video.current.srcObject = stream
        await video.current.play()
        const detector = new Detector()
        run.timer = window.setInterval(async () => {
          const found = video.current ? await detector.detect(video.current).catch(() => []) : []
          if (found[0]?.rawValue) onRead(found[0].rawValue)
        }, 300)
      })
      .catch(() => setError("دسترسی به دوربین داده نشد؛ اجازه‌ی دوربین را در مرورگر بدهید یا کد را تایپ کنید."))
    return () => {
      run.stopped = true
      window.clearInterval(run.timer)
      run.stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onRead])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>خواندن «{title}»</DialogTitle>
          <DialogDescription>بارکد یا QR را جلوی دوربین نگه دارید.</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-xs text-destructive">{error}</p> : <video ref={video} muted playsInline className="aspect-video w-full rounded-md bg-muted object-cover" />}
      </DialogContent>
    </Dialog>
  )
}

// ─── موقعیت مکانی ────────────────────────────────────────────────────────

type LocationValue = { lat?: string; lng?: string; accuracy?: number }

export function LocationField(p: FieldProps) {
  const [locating, setLocating] = React.useState(false)
  const [problem, setProblem] = React.useState("")
  const geo = typeof navigator !== "undefined" && "geolocation" in navigator
  const secure = typeof window !== "undefined" && window.isSecureContext
  const value = (useWatch({ control: p.control, name: p.field.id }) ?? {}) as LocationValue
  return (
    <FormField
      {...common(p)}
      group
      hint={
        problem ||
        (value.accuracy !== undefined
          ? `دقت حدود ${formatNumber(value.accuracy)} متر`
          : geo && !secure
            ? "«موقعیت فعلی من» فقط وقتی سامانه با HTTPS باز شود در دسترس است؛ عددها را دستی وارد کنید."
            : undefined)
      }
      render={({ field, id, aria: { "aria-required": _r, ...aria } }) => {
        const v = (field.value ?? {}) as LocationValue
        // ورود دستی دقت گزارش‌شده‌ی دستگاه را برمی‌دارد
        const set = (key: "lat" | "lng", text: string) => field.onChange({ lat: v.lat ?? "", lng: v.lng ?? "", [key]: toEnDigits(text).replace(/[^\d.-]/g, "") })
        return (
          <div id={id} role="group" tabIndex={-1} className="flex flex-wrap items-center gap-2 outline-none" {...aria}>
            <Input aria-label={`${p.field.label} — عرض جغرافیایی`} placeholder="عرض (مثلاً 35.6892)" inputMode="decimal" dir="ltr" className="w-40 text-start tabular-nums" value={v.lat ?? ""} onChange={(e) => set("lat", e.target.value)} onBlur={field.onBlur} aria-invalid={aria["aria-invalid"]} />
            <Input aria-label={`${p.field.label} — طول جغرافیایی`} placeholder="طول (مثلاً 51.3890)" inputMode="decimal" dir="ltr" className="w-40 text-start tabular-nums" value={v.lng ?? ""} onChange={(e) => set("lng", e.target.value)} onBlur={field.onBlur} aria-invalid={aria["aria-invalid"]} />
            {geo && secure && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locating}
                onClick={() => {
                  setLocating(true)
                  setProblem("")
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setLocating(false)
                      field.onChange({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), accuracy: Math.round(pos.coords.accuracy) })
                    },
                    () => {
                      setLocating(false)
                      setProblem("موقعیت دریافت نشد؛ اجازه‌ی موقعیت مکانی را در مرورگر بدهید یا عددها را دستی وارد کنید.")
                    },
                    { enableHighAccuracy: true, timeout: 15000 }
                  )
                }}
              >
                <LocateFixed /> {locating ? "در حال یافتن…" : "موقعیت فعلی من"}
              </Button>
            )}
          </div>
        )
      }}
    />
  )
}

// ─── صدا ─────────────────────────────────────────────────────────────────

const AUDIO_EXTENSIONS = ["mp3", "m4a", "ogg", "wav", "webm"]

/** صدا: روی موبایل ضبط با ضبط‌کننده‌ی گوشی، در همه‌ی دستگاه‌ها بارگذاری فایل صوتی؛ پخش همان‌جا. */
export function VoiceField(p: FieldProps) {
  const [added, setAdded] = React.useState<StoredFile[]>([])
  const saved = asList(useWatch({ control: p.control, name: p.field.id }))
  const known = useFileInfo(saved.filter((x) => !added.some((f) => f.id === x))).data ?? []
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => {
        const fileId = asList(field.value)[0]
        const file = fileId ? (added.find((f) => f.id === fileId) ?? known.find((f) => f.id === fileId)) : undefined
        if (fileId)
          return (
            <div className="flex flex-wrap items-center gap-2">
              {file && <audio id={id} controls preload="metadata" src={inlineUrl(file)} className="h-9 max-w-full" aria-label={`پخش «${p.field.label}»`} />}
              <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange([])}>
                <Trash2 /> حذف و ضبط دوباره
              </Button>
            </div>
          )
        return (
          <FileDropzone
            id={id}
            extensions={AUDIO_EXTENSIONS}
            record
            onUploaded={(f) => {
              setAdded((prev) => [...prev, f])
              field.onChange([f.id])
            }}
            {...aria}
          />
        )
      }}
    />
  )
}

// ─── اجزای نمایشی ────────────────────────────────────────────────────────

const IMAGE_SIZES: Record<string, string> = { small: "max-w-48", medium: "max-w-md", full: "w-full" }

export function ImageBlock({ field, className }: { field: FieldDef; className?: string }) {
  const id = str(field.props?.file)
  if (!id) return null
  return (
    <figure className={cn("flex flex-col gap-1", className)}>
      <img src={`${fileUrl(id)}?inline=1`} alt={str(field.props?.alt) || field.label || ""} className={cn("h-auto rounded-md border", IMAGE_SIZES[str(field.props?.size)] ?? IMAGE_SIZES.medium)} />
      {field.label && <figcaption className="text-2xs text-muted-foreground">{field.label}</figcaption>}
    </figure>
  )
}

export function DownloadBlock({ field, className }: { field: FieldDef; className?: string }) {
  const id = str(field.props?.file)
  const info = useFileInfo(id ? [id] : []).data?.[0]
  if (!id) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-2 self-start", className)}>
      <Button asChild variant="outline" size="sm">
        <a href={fileUrl(id)} download>
          <Download /> {field.label}
        </a>
      </Button>
      {info && (
        <span className="text-2xs text-muted-foreground">
          {info.extension.toUpperCase()} · {formatFileSize(info.size)}
        </span>
      )}
    </div>
  )
}

export function ParagraphBlock({ field, className }: { field: FieldDef; className?: string }) {
  return <RichTextView html={str(field.props?.content)} className={cn("col-span-full", className)} />
}
