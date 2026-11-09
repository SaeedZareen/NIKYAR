import * as React from "react"
import { useParams } from "react-router"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ListChecks, PencilLine, Plus, Redo2, Send, Settings2, SlidersHorizontal, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { DESIGN_FORMS_KEY, useFieldTypes } from "@/app/forms"
import { PageError, PageFallback } from "@/app/route-states"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { UnsavedChangesGuard } from "@/components/form/unsaved-changes-guard"
import type { FieldDef, FormDefinition } from "@/components/form-renderer/definition"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { useMinWidth } from "@/hooks/use-mobile"
import { api, ApiError, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber, toFaDigits } from "@/lib/format"
import { Canvas } from "./canvas"
import {
  addSection,
  allIds,
  BLOCKS,
  blockFields,
  commit,
  duplicateField,
  ensureSection,
  errorsByItem,
  fitSpans,
  insertFields,
  locate,
  moveField,
  moveSection,
  newField,
  nudgeField,
  redo,
  removeField,
  removeSection,
  undo,
  updateField,
  updateSection,
  type FieldTypeSpec,
  type History,
} from "./designer-model"
import { FormSettingsSheet } from "./form-settings-sheet"
import { PropertiesPanel, type Selection } from "./properties-panel"
import { Toolbox } from "./toolbox"

type Version = Schemas["FormVersionDetail"]
type DesignForm = Schemas["Form"]

/** طراح فرم: نسخه‌ی پیش‌نویس (ویرایش‌پذیر) یا آخرین نسخه‌ی منتشرشده (فقط خواندنی) یک فرم. */
export default function DesignerPage() {
  const { formId = "" } = useParams()
  const query = useQuery({
    queryKey: [...DESIGN_FORMS_KEY, "editor", formId],
    queryFn: async () => {
      const form = await unwrap(api.GET("/api/forms/{id}/", { params: { path: { id: formId } } }))
      let versionId = form.draft_version
      if (!versionId) versionId = (await unwrap(api.GET("/api/forms/versions/", { params: { query: { form: formId } } })))[0].id
      const version = await unwrap(api.GET("/api/forms/versions/{id}/", { params: { path: { id: versionId } } }))
      return { form, version }
    },
    gcTime: 0,
  })
  const types = useFieldTypes()
  if (query.isPending || types.isPending) return <PageFallback />
  if (query.error || types.error) return <PageError error={query.error ?? types.error} onRetry={() => (query.refetch(), types.refetch())} />
  return <Editor key={query.data.version.id} form={query.data.form} version={query.data.version} specs={types.data} onReload={() => query.refetch()} />
}

type SaveState = { kind: "saved" | "saving" | "error"; at?: string; message?: string }
const AUTOSAVE_DELAY = 1200

function Editor({ form, version, specs, onReload }: { form: DesignForm; version: Version; specs: FieldTypeSpec[]; onReload: () => void }) {
  const qc = useQueryClient()
  const readOnly = version.status !== "draft"
  const specMap = React.useMemo(() => Object.fromEntries(specs.map((s) => [s.code, s])), [specs])
  const initial = React.useMemo(() => (readOnly ? (version.definition as FormDefinition) : ensureSection(version.definition as FormDefinition)), [version, readOnly])
  const [history, setHistory] = React.useState<History>({ past: [], present: initial, future: [] })
  const definition = history.present
  const [selection, setSelection] = React.useState<Selection>(null)
  const [saved, setSaved] = React.useState(() => JSON.stringify(version.definition))
  const [save, setSave] = React.useState<SaveState>({ kind: "saved", at: version.updated_at })
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({})
  const [settings, setSettings] = React.useState(false)
  const [toolsOpen, setToolsOpen] = React.useState(false)
  const [propsOpen, setPropsOpen] = React.useState(false)
  const [removingSection, setRemovingSection] = React.useState<string | null>(null)
  const [dragLabel, setDragLabel] = React.useState<string | null>(null)
  const wide = useMinWidth(1280)
  const pending = React.useRef<Promise<unknown>>(Promise.resolve())

  const serialized = JSON.stringify(definition)
  const changed = !readOnly && serialized !== saved
  const errors = React.useMemo(() => errorsByItem(definition, serverErrors), [definition, serverErrors])
  const invalid = React.useMemo(() => new Set(Object.keys(errors)), [errors])

  /** هر تغییر: تاریخچه‌ی واگرد و پهنای فیلدها هماهنگ با ستون‌ها. */
  const apply = React.useCallback((change: (d: FormDefinition) => FormDefinition, key?: string) => {
    setHistory((h) => commit(h, fitSpans(change(h.present)), key))
  }, [])

  // ذخیره‌ی خودکار پیش‌نویس، کمی پس از آخرین تغییر؛ سرور تعریف را می‌سنجد و ایرادها روی بوم و پانل می‌نشینند.
  React.useEffect(() => {
    if (!changed) return
    const timer = window.setTimeout(() => {
      const body = JSON.parse(serialized) as FormDefinition
      setSave({ kind: "saving" })
      const run = pending.current.then(() => unwrap(api.PATCH("/api/forms/versions/{id}/", { params: { path: { id: version.id } }, body: { definition: body } })))
      pending.current = run.catch(() => undefined)
      run.then(
        (v) => {
          setSaved(JSON.stringify(body))
          setServerErrors({})
          setSave({ kind: "saved", at: v.updated_at })
        },
        (e) => {
          setServerErrors(e instanceof ApiError ? e.fields : {})
          setSave({ kind: "error", message: errorMessage(e) })
        }
      )
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [changed, serialized, version.id])

  // واگرد/ازنو با Ctrl+Z و Ctrl+Y (درون کادرهای متن، واگرد خود مرورگر کار می‌کند).
  React.useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (!(e.ctrlKey || e.metaKey) || target.closest("input, textarea, [contenteditable]")) return
      const key = e.key.toLowerCase()
      if (key === "z" && !e.shiftKey) setHistory(undo)
      else if (key === "y" || (key === "z" && e.shiftKey)) setHistory(redo)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [readOnly])

  /** جای افزودن: پس از فیلد انتخاب‌شده، یا انتهای بخش انتخاب‌شده، یا انتهای آخرین بخش. */
  const insertPoint = (): { section: string; index?: number } => {
    if (selection?.kind === "field") {
      const at = locate(definition, selection.id)
      if (at) return { section: definition.sections[at.section].id, index: at.index + 1 }
    }
    if (selection?.kind === "section") return { section: selection.id }
    return { section: definition.sections[definition.sections.length - 1].id }
  }
  const addFields = (make: (taken: Set<string>) => FieldDef[], target = insertPoint()) => {
    const fields = make(allIds(definition))
    apply((d) => insertFields(d, target.section, fields, target.index))
    setSelection({ kind: "field", id: fields[0].id })
    setToolsOpen(false)
    if (!wide) setPropsOpen(true)
  }
  const addType = (code: string, target?: { section: string; index?: number }) => addFields((taken) => [newField(specMap[code], taken)], target)
  const addBlock = (key: string, target?: { section: string; index?: number }) => addFields((taken) => blockFields(BLOCKS.find((b) => b.key === key)!, taken), target)

  const select = (s: Selection) => {
    setSelection(s)
    if (!wide && s) setPropsOpen(true)
  }

  // نزدیک‌ترین فیلد مقصد است؛ بخش فقط وقتی خالی است و نشانگر درونش است (وگرنه همیشه «انتهای بخش» برنده می‌شد).
  const emptySections = new Set(definition.sections.filter((s) => s.fields.length === 0).map((s) => `section:${s.id}`))
  const collision: CollisionDetection = (args) => {
    const sections = rectIntersection({ ...args, droppableContainers: args.droppableContainers.filter((c) => emptySections.has(String(c.id))) })
    if (sections.length) return sections
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith("section:")) })
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const labelOf = (id: string) => {
    for (const s of definition.sections) for (const f of s.fields) if (f.id === id) return f.label || id
    return id
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `«${labelOf(String(active.id))}» برداشته شد.`,
    onDragOver: ({ active, over }) => (over ? `«${labelOf(String(active.id))}» روی «${labelOf(String(over.id))}» است.` : `«${labelOf(String(active.id))}» بیرون از فهرست است.`),
    onDragEnd: ({ active, over }) => (over ? `«${labelOf(String(active.id))}» جابه‌جا شد.` : `«${labelOf(String(active.id))}» سر جایش ماند.`),
    onDragCancel: ({ active }) => `جابه‌جایی «${labelOf(String(active.id))}» لغو شد.`,
  }
  const onDragStart = (e: DragStartEvent) => setDragLabel((e.active.data.current?.label as string | undefined) ?? null)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragLabel(null)
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    let target: { section: string; index?: number } | null = null
    if (overId.startsWith("section:")) target = { section: overId.slice("section:".length) }
    else {
      const at = locate(definition, overId)
      if (at) target = { section: definition.sections[at.section].id, index: at.index }
    }
    if (!target) return
    if (activeId.startsWith("new:")) addType(activeId.slice(4), target)
    else if (activeId.startsWith("block:")) addBlock(activeId.slice(6), target)
    else if (activeId !== overId) {
      const section = definition.sections.find((s) => s.id === target.section)!
      apply((d) => moveField(d, activeId, target.section, target.index ?? section.fields.length))
    }
  }

  const publish = useMutation({
    mutationFn: async () => {
      await pending.current
      return unwrap(api.POST("/api/forms/versions/{id}/publish/", { params: { path: { id: version.id } } }))
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: DESIGN_FORMS_KEY })
      qc.invalidateQueries({ queryKey: ["forms", "available"] })
      toast.success(`نسخه‌ی ${toFaDigits(v.number)} «${form.title}» منتشر شد؛ از این پس فرم با همین نسخه پر می‌شود.`)
      onReload()
    },
    onError: (e) => {
      if (e instanceof ApiError) setServerErrors(e.fields)
      toast.error(errorMessage(e))
    },
  })
  const newDraft = useMutation({
    mutationFn: () => unwrap(api.POST("/api/forms/{id}/new-draft/", { params: { path: { id: String(form.id) } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESIGN_FORMS_KEY })
      onReload()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const fieldCount = definition.sections.reduce((n, s) => n + s.fields.length, 0)
  const status = readOnly
    ? `نسخه‌ی ${toFaDigits(version.number)} منتشرشده · فقط خواندنی`
    : {
        saved: `پیش‌نویس نسخه‌ی ${toFaDigits(version.number)} · ${formatNumber(fieldCount)} فیلد${save.at ? ` · ذخیره شد ${formatDateTime(save.at)}` : ""}`,
        saving: "در حال ذخیره‌ی پیش‌نویس…",
        error: `ذخیره نشد: ${save.message}`,
      }[save.kind]
  const errorCount = Object.keys(serverErrors).length

  const toolbox = <Toolbox specs={specs} onAdd={(c) => addType(c)} onAddBlock={(k) => addBlock(k)} draggable={wide} disabled={readOnly} />
  const properties = (
    <PropertiesPanel
      definition={definition}
      selection={selection}
      specs={specMap}
      errors={selection ? (errors[selection.id] ?? {}) : {}}
      readOnly={readOnly}
      onField={(id, change, key) => {
        // تغییر شناسه‌ی فنی، انتخاب را با فیلد نگه می‌دارد.
        const before = definition.sections.flatMap((s) => s.fields).find((f) => f.id === id)
        const after = before && change(before)
        apply((d) => updateField(d, id, change), key)
        if (after && after.id !== id) setSelection({ kind: "field", id: after.id })
      }}
      onSection={(id, change, key) => apply((d) => updateSection(d, id, change), key)}
      onRules={(rules) => apply((d) => (rules.length ? { ...d, rules } : (({ rules: _r, ...rest }) => rest)(d)), "rules")}
      formErrors={errors.form ?? {}}
    />
  )

  return (
    <>
      <PageHeader
        title={form.title}
        breadcrumbs={[{ label: "طراحی فرم‌ها", to: "/forms/design" }]}
        meta={<span aria-live="polite">{status}</span>}
        actions={
          <>
            {!readOnly && (
              <>
                <Button variant="ghost" size="icon" aria-label="واگرد (Ctrl+Z)" disabled={!history.past.length} onClick={() => setHistory(undo)}>
                  <Undo2 />
                </Button>
                <Button variant="ghost" size="icon" aria-label="ازنو (Ctrl+Y)" disabled={!history.future.length} onClick={() => setHistory(redo)}>
                  <Redo2 />
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setSettings(true)}>
              <Settings2 /> تنظیمات
            </Button>
            {readOnly ? (
              <Button disabled={newDraft.isPending} onClick={() => newDraft.mutate()}>
                {newDraft.isPending ? <Spinner /> : <PencilLine />} ویرایش فرم
              </Button>
            ) : (
              <Button disabled={publish.isPending || changed || save.kind !== "saved"} onClick={() => publish.mutate()}>
                {publish.isPending ? <Spinner /> : <Send />} انتشار
              </Button>
            )}
          </>
        }
      />
      {readOnly && (
        <Alert>
          <AlertDescription>این نسخه منتشر شده و پرکنندگان با همین فرم کار می‌کنند. برای تغییر، «ویرایش فرم» را بزنید تا پیش‌نویس تازه‌ای ساخته شود؛ ثبت‌های گذشته با نسخه‌ی خودشان می‌مانند.</AlertDescription>
        </Alert>
      )}
      {errorCount > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {formatNumber(errorCount)} ایراد در تعریف فرم هست؛ فیلدهای با کادر قرمز را انتخاب کنید تا پیام هر ایراد را در پانل ویژگی‌ها ببینید.
            {errors.form && ` ${Object.values(errors.form).join(" ")}`}
          </AlertDescription>
        </Alert>
      )}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragLabel(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: "برای برداشتن Space را بزنید، با کلیدهای جهت جابه‌جا کنید، Space برای رها کردن و Escape برای لغو." } }}>
        <div className="grid items-start gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
          {wide && (
            <Section title="جعبه‌ابزار" description="با کلیک، فیلد پس از فیلد انتخاب‌شده اضافه می‌شود؛ یا آن را روی بوم بکشید." className="sticky top-[calc(var(--header-height)+0.75rem)]" contentClassName="max-h-[calc(100vh-10rem)] overflow-y-auto p-0">
              {toolbox}
            </Section>
          )}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {!wide && !readOnly && (
                <>
                  <Button variant="outline" onClick={() => setToolsOpen(true)}>
                    <Plus /> افزودن فیلد
                  </Button>
                  <Button variant="outline" disabled={!selection} onClick={() => setPropsOpen(true)}>
                    <SlidersHorizontal /> ویژگی‌ها
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                aria-pressed={!selection}
                onClick={() => {
                  setSelection(null)
                  if (!wide) setPropsOpen(true)
                }}
              >
                <ListChecks /> اعتبارسنجی بین فیلدها{definition.rules?.length ? ` (${formatNumber(definition.rules.length)})` : ""}
              </Button>
            </div>
            <Canvas
              definition={definition}
              selection={selection}
              invalid={invalid}
              readOnly={readOnly}
              onSelect={select}
              onNudgeField={(id, delta) => apply((d) => nudgeField(d, id, delta))}
              onDuplicateField={(id) => {
                const result = duplicateField(definition, id)
                apply(() => result.def)
                setSelection({ kind: "field", id: result.id })
              }}
              onRemoveField={(id) => {
                apply((d) => removeField(d, id))
                if (selection?.id === id) setSelection(null)
              }}
              onMoveSection={(id, delta) => apply((d) => moveSection(d, id, delta))}
              onSectionChange={(id, change, key) => apply((d) => updateSection(d, id, change), key)}
              onFieldChange={(id, change, key) => apply((d) => updateField(d, id, change), key)}
              onRemoveSection={(id) => {
                const section = definition.sections.find((s) => s.id === id)
                if (section?.fields.length) setRemovingSection(id)
                else {
                  apply((d) => removeSection(d, id))
                  if (selection?.id === id) setSelection(null)
                }
              }}
              onAddSection={() => {
                const result = addSection(definition)
                apply(() => result.def)
                select({ kind: "section", id: result.id })
              }}
            />
          </div>
          {wide && (
            <Section title="ویژگی‌ها" className="sticky top-[calc(var(--header-height)+0.75rem)]" contentClassName="max-h-[calc(100vh-10rem)] overflow-y-auto p-0">
              {properties}
            </Section>
          )}
        </div>
        <DragOverlay>{dragLabel && <div className="rounded-md border bg-background px-3 py-1.5 text-xs shadow-md">{dragLabel}</div>}</DragOverlay>
      </DndContext>

      {!wide && (
        <>
          <Sheet open={toolsOpen} onOpenChange={setToolsOpen}>
            <SheetContent side="right" className="gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b bg-muted/50 py-3">
                <SheetTitle className="text-sm">افزودن فیلد</SheetTitle>
              </SheetHeader>
              {toolbox}
            </SheetContent>
          </Sheet>
          <Sheet open={propsOpen} onOpenChange={setPropsOpen}>
            <SheetContent side="left" className="gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b bg-muted/50 py-3">
                <SheetTitle className="text-sm">ویژگی‌ها</SheetTitle>
              </SheetHeader>
              {properties}
            </SheetContent>
          </Sheet>
        </>
      )}
      {settings && <FormSettingsSheet form={form} open onOpenChange={setSettings} />}
      {removingSection && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemovingSection(null)}
          title="بخش با همه‌ی فیلدهایش حذف شود؟"
          description="با «واگرد» برمی‌گردد."
          confirmLabel="حذف بخش"
          destructive
          onConfirm={async () => {
            apply((d) => removeSection(d, removingSection))
            setSelection(null)
          }}
        />
      )}
      <UnsavedChangesGuard when={changed || save.kind === "saving"} />
    </>
  )
}
