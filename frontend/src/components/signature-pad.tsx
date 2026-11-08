import * as React from "react"
import { Eraser, PenLine, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage } from "@/lib/api/client"
import { uploadFile } from "@/lib/files"

type Props = {
  id?: string
  /** شناسه‌ی فایل امضای ذخیره‌شده؛ خالی یعنی هنوز امضا نشده. */
  value: string
  onChange: (fileId: string) => void
  label: string
} & Pick<React.AriaAttributes, "aria-invalid" | "aria-describedby">

/**
 * امضای دستی روی صفحه با قلم، ماوس یا انگشت؛ «ثبت امضا» تصویر PNG را بارگذاری می‌کند و شناسه‌ی فایل مقدار فیلد می‌شود.
 * پس از ثبت، تصویر امضا با دکمه‌ی «امضای دوباره» نمایش داده می‌شود.
 */
export function SignaturePad({ id, value, onChange, label, ...aria }: Props) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const drawing = React.useRef(false)
  const [empty, setEmpty] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    const c = canvas.current
    if (!c) return
    // وضوح واقعی صفحه‌نمایش تا امضا روی نمایشگرهای پرتراکم تیز بماند.
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext("2d")!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    // امضا سند است: جوهر تیره روی زمینه‌ی سفید، مستقل از پوسته‌ی روشن یا تیره (برای چاپ).
    ctx.strokeStyle = "#1e293b"
  }, [value])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const clear = () => {
    const c = canvas.current!
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
    setEmpty(true)
  }
  const save = () => {
    setSaving(true)
    setError("")
    canvas.current!.toBlob((blob) => {
      if (!blob) return setSaving(false)
      uploadFile(new File([blob], "signature.png", { type: "image/png" }), { imagesOnly: true })
        .then((f) => onChange(f.id))
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setSaving(false))
    }, "image/png")
  }

  if (value)
    return (
      <div className="flex flex-wrap items-end gap-3">
        <img src={`/api/files/${value}/download/?inline=1`} alt={label} className="h-24 rounded-md border bg-white p-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => onChange("")}>
          <RefreshCw /> امضای دوباره
        </Button>
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvas}
        id={id}
        tabIndex={0}
        role="img"
        aria-label={`محل امضا: ${label}`}
        className="h-32 w-full max-w-md touch-none rounded-md border border-dashed bg-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        onPointerDown={(e) => {
          drawing.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const ctx = e.currentTarget.getContext("2d")!
          const [x, y] = point(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = e.currentTarget.getContext("2d")!
          const [x, y] = point(e)
          ctx.lineTo(x, y)
          ctx.stroke()
          setEmpty(false)
        }}
        onPointerUp={() => (drawing.current = false)}
        {...aria}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={empty || saving} onClick={save}>
          {saving ? <Spinner /> : <PenLine />} ثبت امضا
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={empty || saving} onClick={clear}>
          <Eraser /> پاک کردن
        </Button>
        {error ? (
          <span role="alert" className="text-2xs text-destructive">
            {error}
          </span>
        ) : (
          <span className="text-2xs text-muted-foreground">با ماوس، قلم یا انگشت داخل کادر امضا کنید.</span>
        )}
      </div>
    </div>
  )
}
