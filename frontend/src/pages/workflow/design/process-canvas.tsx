import "bpmn-js/dist/assets/diagram-js.css"
import "bpmn-js/dist/assets/bpmn-js.css"
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css"
import "./bpmn-theme.css"
import * as React from "react"
import Modeler from "bpmn-js/lib/Modeler"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"
import { nikyarModules, themeOptions } from "./bpmn-modules"
import { spiffworkflowModdle } from "./spiffworkflow-moddle"

/** کنترل بوم از بیرون (نوار ابزار و فهرست ایرادها). */
export type CanvasHandle = {
  save: () => Promise<string>
  undo: () => void
  redo: () => void
  fit: () => void
  zoom: (step: number) => void
  focus: (id: string) => void
  label: (id: string) => string | null
  /** ویرایشگر bpmn-js برای پانل ویژگی‌ها (null در حالت فقط‌خواندنی). */
  modeler: () => Modeler | null
}

type Props = {
  xml: string
  readOnly: boolean
  problems: Record<string, string>
  ref?: React.Ref<CanvasHandle>
  onChange?: () => void
  onHistory?: (canUndo: boolean, canRedo: boolean) => void
  /** پس از خواندن نمودار (برای نام عنصرهای فهرست ایرادها). */
  onReady?: () => void
  /** عنصر انتخاب‌شده تغییر کرد یا ویژگی‌هایش عوض شد (شناسه یا null). */
  onSelection?: (id: string | null) => void
  /** نام دسترس‌پذیر بوم (پیش‌فرض: «بوم فرایند» یا «نمودار فقط‌خواندنی»). */
  label?: string
  className?: string
}

type Diagram = Modeler | NavigatedViewer

const TYPE_LABELS: Record<string, string> = {
  "bpmn:StartEvent": "رویداد شروع",
  "bpmn:EndEvent": "رویداد پایان",
  "bpmn:UserTask": "کار کاربری بی‌عنوان",
  "bpmn:ServiceTask": "اقدام خودکار بی‌عنوان",
  "bpmn:ExclusiveGateway": "دروازه‌ی شرطی",
  "bpmn:ParallelGateway": "دروازه‌ی موازی",
  "bpmn:SequenceFlow": "مسیر",
}

/**
 * بوم BPMN (bpmn-js): ویرایشگر با عنصرهای پشتیبانی‌شده‌ی نیک‌یار، یا نمایشگر فقط‌خواندنی.
 * xml فقط هنگام ساخت خوانده می‌شود؛ برای نسخه یا پوسته‌ی دیگر، والد با key بوم را از نو می‌سازد.
 */
export function ProcessCanvas({ xml, readOnly, problems, ref, onChange, onHistory, onReady, onSelection, label, className }: Props) {
  const host = React.useRef<HTMLDivElement>(null)
  const diagram = React.useRef<Diagram | null>(null)
  const [ready, setReady] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)
  const callbacks = React.useRef({ onChange, onHistory, onReady, onSelection })
  React.useEffect(() => {
    callbacks.current = { onChange, onHistory, onReady, onSelection }
  })

  React.useEffect(() => {
    const options = { container: host.current!, moddleExtensions: { spiffworkflow: spiffworkflowModdle }, ...themeOptions() }
    const instance: Diagram = readOnly ? new NavigatedViewer(options) : new Modeler({ ...options, additionalModules: nikyarModules })
    diagram.current = instance
    let disposed = false
    instance
      .importXML(xml)
      .then(() => {
        if (disposed) return
        ;(instance.get("canvas") as any).zoom("fit-viewport", "auto")
        setReady(true)
        callbacks.current.onReady?.()
      })
      .catch(() => !disposed && setFailed("نمودار این فرایند خوانا نیست."))
    if (!readOnly) {
      instance.on("commandStack.changed", () => {
        const stack = instance.get("commandStack") as any
        callbacks.current.onHistory?.(stack.canUndo(), stack.canRedo())
        callbacks.current.onChange?.()
      })
      instance.on("selection.changed", (event: any) => callbacks.current.onSelection?.(event.newSelection?.length === 1 ? event.newSelection[0].id : null))
    }
    return () => {
      disposed = true
      instance.destroy()
      diagram.current = null
    }
    // xml فقط بار نخست (بالا را ببینید)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // کادر قرمز روی عنصرهای دارای ایراد
  React.useEffect(() => {
    const instance = diagram.current
    if (!instance || !ready) return
    const canvas = instance.get("canvas") as any
    const registry = instance.get("elementRegistry") as any
    registry.forEach((element: any) => canvas.removeMarker(element, "nk-error"))
    for (const id of Object.keys(problems)) if (registry.get(id)) canvas.addMarker(id, "nk-error")
  }, [problems, ready])

  React.useImperativeHandle(
    ref,
    () => ({
      save: async () => (await diagram.current!.saveXML({ format: true })).xml ?? "",
      undo: () => (diagram.current?.get("commandStack") as any)?.undo(),
      redo: () => (diagram.current?.get("commandStack") as any)?.redo(),
      fit: () => (diagram.current?.get("canvas") as any)?.zoom("fit-viewport", "auto"),
      zoom: (step) => {
        const canvas = diagram.current?.get("canvas") as any
        if (canvas) canvas.zoom(Math.min(4, Math.max(0.2, canvas.zoom() + step)))
      },
      focus: (id) => {
        const instance = diagram.current
        const element = (instance?.get("elementRegistry") as any)?.get(id)
        if (!instance || !element) return
        const canvas = instance.get("canvas") as any
        canvas.scrollToElement(element)
        if (!readOnly) (instance.get("selection") as any).select(element)
      },
      modeler: () => (readOnly ? null : (diagram.current as Modeler | null)),
      label: (id) => {
        const element = (diagram.current?.get("elementRegistry") as any)?.get(id)
        if (!element) return null
        return element.businessObject?.name || TYPE_LABELS[element.type] || "عنصر"
      },
    }),
    [readOnly]
  )

  return (
    <div className={className}>
      {failed ? (
        <p className="p-4 text-xs text-destructive">{failed}</p>
      ) : (
        // بوم چپ‌به‌راست می‌ماند (جهت جریان BPMN)؛ برچسب‌های فارسی درون عنصرها درست نمایش داده می‌شوند.
        <div ref={host} dir="ltr" role="region" aria-label={label ?? (readOnly ? "نمودار فقط‌خواندنی" : "بوم فرایند")} className="nk-bpmn size-full" />
      )}
    </div>
  )
}
