import * as React from "react"
import { useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { History as HistoryIcon, Maximize, PencilLine, Redo2, Send, Settings2, SlidersHorizontal, Undo2, ZoomIn, ZoomOut } from "lucide-react"
import { toast } from "sonner"
import { DESIGN_PROCESSES_KEY } from "@/app/workflow"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { useTheme } from "@/components/theme-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile, useMinWidth } from "@/hooks/use-mobile"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber, toFaDigits } from "@/lib/format"
import { ProcessCanvas, type CanvasHandle } from "./process-canvas"
import { ElementProperties } from "./process-properties"
import { ProcessVersionsSheet } from "./process-versions-sheet"
import { ProcessSheet } from "./process-sheet"

type Version = Schemas["ProcessVersionDetail"]
type Save = { kind: "saved" | "saving" | "error"; at?: Date; message?: string }
const AUTOSAVE_MS = 800
const GENERAL: Record<string, string> = { bpmn: "کل فرایند", form: "فرم اصلی" }

/** فرایندساز: بوم bpmn-js، ذخیره‌ی خودکار پیش‌نویس، ایرادهای انتشار روی عنصرها، انتشار و پیش‌نویس تازه. */
export default function ProcessDesignerPage() {
  const id = useParams().processId ?? ""
  const qc = useQueryClient()
  const process = useQuery({ queryKey: [...DESIGN_PROCESSES_KEY, "process", id], queryFn: () => unwrap(api.GET("/api/workflow/processes/{id}/", { params: { path: { id } } })) })
  const versionId = process.data ? (process.data.draft_version ?? null) : undefined
  const versions = useQuery({
    queryKey: [...DESIGN_PROCESSES_KEY, "versions", id],
    queryFn: () => unwrap(api.GET("/api/workflow/versions/", { params: { query: { process: id } } })),
    enabled: versionId === null,
  })
  const current = versionId ?? versions.data?.[0]?.id
  const version = useQuery({
    queryKey: [...DESIGN_PROCESSES_KEY, "version", current],
    queryFn: () => unwrap(api.GET("/api/workflow/versions/{id}/", { params: { path: { id: current! } } })),
    enabled: current !== undefined,
  })
  // ورود فایل BPMN همان پیش‌نویس را عوض می‌کند؛ بوم با شماره‌ی تازه از نو ساخته می‌شود
  const [generation, setGeneration] = React.useState(0)
  if (!process.data || !version.data) {
    return (
      <>
        <PageHeader title="فرایندساز" breadcrumbs={[{ label: "طراحی فرایندها", to: "/workflow/design" }]} />
        {process.error || version.error ? <p className="text-xs text-destructive">{errorMessage(process.error ?? version.error)}</p> : <Skeleton className="h-96 w-full" />}
      </>
    )
  }
  return (
    <Designer
      key={`${version.data.id}-${generation}`}
      process={process.data}
      version={version.data}
      onReplaced={async () => {
        await version.refetch()
        setGeneration((g) => g + 1)
      }}
      onReload={() => {
        qc.invalidateQueries({ queryKey: DESIGN_PROCESSES_KEY })
      }}
    />
  )
}

function Designer({ process, version, onReload, onReplaced }: { process: Schemas["Process"]; version: Version; onReload: () => void; onReplaced: () => void }) {
  const mobile = useIsMobile()
  const wide = useMinWidth(1280)
  const formDefinition = useQuery({
    queryKey: [...DESIGN_PROCESSES_KEY, "form-definition", process.id],
    queryFn: () => unwrap(api.GET("/api/workflow/processes/{id}/form-definition/", { params: { path: { id: String(process.id) } } })),
  })
  const actionTypes = useQuery({ queryKey: [...DESIGN_PROCESSES_KEY, "action-types"], queryFn: () => unwrap(api.GET("/api/workflow/processes/action-types/")), staleTime: Infinity })
  const [selected, setSelected] = React.useState<string | null>(null)
  // هر تغییر بوم پانل ویژگی‌ها را از نو می‌خواند
  const [, setRevision] = React.useState(0)
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [showVersions, setShowVersions] = React.useState(false)
  const [modeler, setModeler] = React.useState<ReturnType<CanvasHandle["modeler"]>>(null)
  const { resolvedTheme } = useTheme()
  const readOnly = version.status !== "draft" || mobile
  const canvas = React.useRef<CanvasHandle>(null)
  // متن آخرین ذخیره؛ بوم فقط هنگام ساخت (نسخه یا پوسته‌ی تازه) آن را می‌خواند
  const [snapshot, setSnapshot] = React.useState(version.bpmn)
  const [problems, setProblems] = React.useState<Record<string, string>>(version.problems)
  const [labels, setLabels] = React.useState<Record<string, string | null>>({})
  const describe = React.useCallback((found: Record<string, string>) => {
    const handle = canvas.current
    if (handle) setLabels(Object.fromEntries(Object.keys(found).map((key) => [key, handle.label(key)])))
  }, [])
  const [save, setSave] = React.useState<Save>({ kind: "saved" })
  const [dirty, setDirty] = React.useState(false)
  const [history, setHistory] = React.useState({ undo: false, redo: false })
  const [editing, setEditing] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)
  // ذخیره‌ها پشت سر هم اجرا می‌شوند تا پاسخ قدیمی‌تر روی تازه‌تر ننشیند
  const queue = React.useRef(Promise.resolve())

  const persist = React.useCallback(() => {
    queue.current = queue.current.then(async () => {
      const handle = canvas.current
      if (!handle) return
      setSave({ kind: "saving" })
      setDirty(false)
      try {
        const xml = await handle.save()
        const saved = await unwrap(api.PATCH("/api/workflow/versions/{id}/", { params: { path: { id: version.id } }, body: { bpmn: xml } }))
        setSnapshot(xml)
        setProblems(saved.problems)
        describe(saved.problems)
        setSave({ kind: "saved", at: new Date() })
      } catch (e) {
        setSave({ kind: "error", message: errorMessage(e) })
      }
    })
  }, [version.id, describe])

  const onChange = React.useCallback(() => {
    setRevision((r) => r + 1)
    setDirty(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(persist, AUTOSAVE_MS)
  }, [persist])
  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const publish = useMutation({
    mutationFn: () => unwrap(api.POST("/api/workflow/versions/{id}/publish/", { params: { path: { id: version.id } } })),
    onSuccess: () => {
      toast.success(`نسخه‌ی ${toFaDigits(version.number)} منتشر شد؛ درخواست‌های تازه با همین نسخه شروع می‌شوند.`)
      onReload()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const newDraft = useMutation({
    mutationFn: () => unwrap(api.POST("/api/workflow/processes/{id}/new-draft/", { params: { path: { id: String(process.id) } } })),
    onSuccess: () => onReload(),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const problemList = Object.entries(problems)
  const properties =
    modeler && formDefinition.data ? (
      <ElementProperties
        modeler={modeler}
        id={selected}
        definition={formDefinition.data as unknown as FormDefinition}
        actions={actionTypes.data ?? []}
        problem={selected ? problems[selected] : undefined}
      />
    ) : (
      <p className="text-xs text-muted-foreground">در حال آماده‌سازی…</p>
    )
  const status =
    version.status !== "draft"
      ? `نسخه‌ی ${toFaDigits(version.number)} منتشرشده · فقط خواندنی`
      : dirty
        ? "تغییرها چند لحظه‌ی دیگر ذخیره می‌شوند…"
        : {
            saved: `پیش‌نویس نسخه‌ی ${toFaDigits(version.number)}${save.at ? ` · ذخیره شد ${formatDateTime(save.at)}` : ""}`,
            saving: "در حال ذخیره‌ی پیش‌نویس…",
            error: `ذخیره نشد: ${save.message}`,
          }[save.kind]

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={process.title}
        breadcrumbs={[{ label: "طراحی فرایندها", to: "/workflow/design" }]}
        meta={<span aria-live="polite">{status}</span>}
        actions={
          <>
            {!readOnly && (
              <>
                <Button variant="ghost" size="icon" aria-label="واگرد (Ctrl+Z)" disabled={!history.undo} onClick={() => canvas.current?.undo()}>
                  <Undo2 />
                </Button>
                <Button variant="ghost" size="icon" aria-label="ازنو (Ctrl+Y)" disabled={!history.redo} onClick={() => canvas.current?.redo()}>
                  <Redo2 />
                </Button>
              </>
            )}
            {!readOnly && !wide && (
              <Button variant="outline" disabled={!selected} onClick={() => setPanelOpen(true)}>
                <SlidersHorizontal /> ویژگی‌های عنصر
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowVersions(true)}>
              <HistoryIcon /> نسخه‌ها
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Settings2 /> مشخصات
            </Button>
            {version.status !== "draft" ? (
              !mobile && (
                <Button disabled={newDraft.isPending} onClick={() => newDraft.mutate()}>
                  {newDraft.isPending ? <Spinner /> : <PencilLine />} ویرایش فرایند
                </Button>
              )
            ) : (
              <Button disabled={publish.isPending || dirty || save.kind !== "saved" || problemList.length > 0} onClick={() => publish.mutate()}>
                {publish.isPending ? <Spinner /> : <Send />} انتشار
              </Button>
            )}
          </>
        }
      />
      {mobile && (
        <Alert>
          <AlertDescription>روی موبایل فقط نمودار فرایند دیده می‌شود؛ برای طراحی از رایانه یا لپ‌تاپ استفاده کنید.</AlertDescription>
        </Alert>
      )}
      {!mobile && version.status !== "draft" && (
        <Alert>
          <AlertDescription>این نسخه منتشر شده و درخواست‌ها با همین مسیر جلو می‌روند. برای تغییر، «ویرایش فرایند» را بزنید تا پیش‌نویس تازه‌ای ساخته شود؛ درخواست‌های در جریان با نسخه‌ی خودشان تمام می‌شوند.</AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Section
          title="نمودار فرایند"
          description="از نوار ابزار کنار بوم عنصر بکشید (روی یک مسیر رها کنید تا میان دو مرحله قرار گیرد)، یا روی یک عنصر بزنید و از منوی کنارش مرحله‌ی بعد را بیفزایید؛ با دوبار زدن، عنوان را بنویسید. همه‌چیز خودکار ذخیره می‌شود."
          actions={
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="بزرگ‌نمایی" onClick={() => canvas.current?.zoom(0.2)}>
                <ZoomIn />
              </Button>
              <Button variant="ghost" size="icon" aria-label="کوچک‌نمایی" onClick={() => canvas.current?.zoom(-0.2)}>
                <ZoomOut />
              </Button>
              <Button variant="ghost" size="icon" aria-label="نمایش کل نمودار" onClick={() => canvas.current?.fit()}>
                <Maximize />
              </Button>
            </div>
          }
          contentClassName="p-0"
        >
          <ProcessCanvas
            key={`${readOnly}-${resolvedTheme}`}
            ref={canvas}
            xml={snapshot}
            readOnly={readOnly}
            problems={problems}
            onChange={onChange}
            onHistory={(undo, redo) => setHistory({ undo, redo })}
            onReady={() => {
              describe(problems)
              setModeler(canvas.current?.modeler() ?? null)
            }}
            onSelection={setSelected}
            className="h-[max(26rem,calc(100svh-17rem))]"
          />
        </Section>
        {version.status === "draft" && (
          <div className="flex flex-col gap-3">
          {!readOnly && wide && <Section title="ویژگی‌ها">{properties}</Section>}
          <Section title="ایرادهای انتشار" meta={problemList.length ? `${formatNumber(problemList.length)} ایراد` : "آماده‌ی انتشار"}>
            {problemList.length === 0 ? (
              <p className="text-xs text-muted-foreground">ایرادی نیست؛ فرایند آماده‌ی انتشار است.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {problemList.map(([key, message]) => {
                  const label = GENERAL[key] ?? labels[key] ?? "عنصر"
                  return (
                    <li key={key}>
                      {key in GENERAL ? (
                        <p className="text-xs">
                          <span className="font-medium">{label}: </span>
                          {message}
                        </p>
                      ) : (
                        <button type="button" className="w-full rounded-md border px-2 py-1.5 text-start text-xs hover:bg-muted/50" onClick={() => canvas.current?.focus(key)}>
                          <span className="font-medium">{label}</span>
                          <span className="block text-muted-foreground">{message}</span>
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
          </div>
        )}
      </div>
      {!readOnly && !wide && (
        <Sheet open={panelOpen && !!selected} onOpenChange={setPanelOpen}>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>ویژگی‌های عنصر</SheetTitle>
              <SheetDescription>تغییرها همان لحظه روی بوم می‌نشینند و خودکار ذخیره می‌شوند.</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">{properties}</div>
          </SheetContent>
        </Sheet>
      )}
      {editing && <ProcessSheet process={process} open onOpenChange={setEditing} />}
      <ProcessVersionsSheet process={process} current={version} open={showVersions} onOpenChange={setShowVersions} onReplaced={onReplaced} />
    </div>
  )
}
