import * as React from "react"
import { useDroppable } from "@dnd-kit/core"
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, GitBranch, GripVertical, MoveHorizontal, Plus, Trash2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { FormGrid } from "@/components/form/form-grid"
import { labelLayout, spanClass, type FieldDef, type FormDefinition, type FormValues, type SectionDef } from "@/components/form-renderer/definition"
import { FieldView } from "@/components/form-renderer/form-renderer"
import { InfoTip } from "@/components/info-tip"
import { Button } from "@/components/ui/button"
import { toFaDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Selection } from "./properties-panel"

type Props = {
  definition: FormDefinition
  selection: Selection
  /** شناسه‌ی فیلدها و بخش‌هایی که خطای سرور دارند. */
  invalid: Set<string>
  readOnly: boolean
  onSelect: (s: Selection) => void
  onNudgeField: (id: string, delta: -1 | 1) => void
  onDuplicateField: (id: string) => void
  onRemoveField: (id: string) => void
  onMoveSection: (id: string, delta: -1 | 1) => void
  /** تغییر مستقیم از روی بوم (ستون‌های بخش، پهنای فیلد). */
  onSectionChange: (id: string, change: (s: SectionDef) => SectionDef, key: string) => void
  onFieldChange: (id: string, change: (f: FieldDef) => FieldDef, key: string) => void
  onRemoveSection: (id: string) => void
  onAddSection: () => void
}

/**
 * بوم طراح: هر بخش و هر فیلد همان‌طور که پرکننده می‌بیند (با همان اجزای نمایشگر)، ولی غیرتعاملی؛
 * زدن روی فیلد آن را انتخاب می‌کند. جابه‌جایی با کشیدن دستگیره (ماوس یا صفحه‌کلید) یا دکمه‌های بالا/پایین.
 */
export function Canvas(props: Props) {
  const { definition, readOnly, onAddSection } = props
  // فرم ساختگی فقط برای نمایش کنترل‌ها؛ مقدارهای بوم جایی ذخیره نمی‌شوند.
  const preview = useForm<FormValues>({ defaultValues: {} })
  return (
    <div className="flex flex-col gap-4">
      {definition.sections.map((section, i) => (
        <CanvasSection key={section.id} {...props} section={section} first={i === 0} last={i === definition.sections.length - 1} control={preview.control} />
      ))}
      {!readOnly && (
        <Button type="button" variant="outline" className="self-start" onClick={onAddSection}>
          <Plus /> بخش تازه
        </Button>
      )}
    </div>
  )
}

type SectionProps = Props & { section: SectionDef; first: boolean; last: boolean; control: ReturnType<typeof useForm<FormValues>>["control"] }

function CanvasSection({ section, first, last, selection, invalid, readOnly, onSelect, onMoveSection, onRemoveSection, onSectionChange, control, ...rest }: SectionProps) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `section:${section.id}`, disabled: readOnly })
  const selected = selection?.kind === "section" && selection.id === section.id
  const columns = Math.min(Math.max(section.columns ?? 1, 1), 3) as 1 | 2 | 3
  const title = section.title || "بخش بی‌عنوان"
  return (
    <section
      ref={dropRef}
      aria-label={title}
      className={cn(
        "rounded-lg border bg-card",
        selected && "ring-2 ring-primary",
        invalid.has(section.id) && "border-destructive",
        isOver && "border-primary bg-accent/40"
      )}
    >
      <div className="flex min-h-10 flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
        <button
          type="button"
          onClick={() => onSelect({ kind: "section", id: section.id })}
          aria-pressed={selected}
          className="rounded-sm text-sm font-semibold hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {title}
        </button>
        {section.help && <InfoTip label={`راهنمای ${title}`}>{section.help}</InfoTip>}
        {section.visible_if !== undefined && (
          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
            <GitBranch className="size-3" aria-hidden /> نمایش شرطی
          </span>
        )}
        {!readOnly && (
          <div className="ms-auto flex items-center gap-0.5">
            <div role="group" aria-label={`ستون‌های بخش «${title}»`} className="me-2 flex items-center gap-0.5 rounded-md border p-0.5">
              {([1, 2, 3] as const).map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={columns === n ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-2xs"
                  aria-pressed={columns === n}
                  aria-label={`${toFaDigits(n)} ستون`}
                  onClick={() => onSectionChange(section.id, (s) => ({ ...s, columns: n }), `columns:${section.id}`)}
                >
                  {toFaDigits(n)} ستون
                </Button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`بالا بردن بخش «${title}»`} disabled={first} onClick={() => onMoveSection(section.id, -1)}>
              <ChevronUp />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`پایین بردن بخش «${title}»`} disabled={last} onClick={() => onMoveSection(section.id, 1)}>
              <ChevronDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف بخش «${title}»`} onClick={() => onRemoveSection(section.id)}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <div className="relative p-3">
        {!readOnly && columns > 1 && (
          // خطوط راهنمای ستون‌ها (فقط در طراح؛ موبایل تک‌ستونه است)
          <div aria-hidden className={cn("pointer-events-none absolute inset-3 hidden gap-x-8 md:grid", columns === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
            {Array.from({ length: columns }, (_, i) => (
              <div key={i} className="rounded-md border border-dashed border-border" />
            ))}
          </div>
        )}
        <SortableContext items={section.fields.map((f) => f.id)} strategy={rectSortingStrategy} disabled={readOnly}>
          <FormGrid columns={columns} fixed>
            {section.fields.map((field) => (
              <CanvasField
                key={field.id}
                field={field}
                className={spanClass(field, columns)}
                columns={columns}
                layout={labelLayout(section)}
                selected={selection?.kind === "field" && selection.id === field.id}
                invalid={invalid.has(field.id)}
                readOnly={readOnly}
                control={control}
                onSelect={() => onSelect({ kind: "field", id: field.id })}
                {...rest}
              />
            ))}
          </FormGrid>
        </SortableContext>
        {section.fields.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            {readOnly ? "این بخش فیلدی ندارد." : "فیلدها را از جعبه‌ابزار به اینجا بکشید یا با کلیک اضافه کنید."}
          </p>
        )}
      </div>
    </section>
  )
}

type FieldProps = Pick<Props, "onNudgeField" | "onDuplicateField" | "onRemoveField" | "onFieldChange"> & {
  field: FieldDef
  columns: number
  layout: "side" | "stacked"
  className: string
  selected: boolean
  invalid: boolean
  readOnly: boolean
  control: SectionProps["control"]
  onSelect: () => void
}

function CanvasField({ field, columns, layout, className, selected, invalid, readOnly, control, onSelect, onNudgeField, onDuplicateField, onRemoveField, onFieldChange }: FieldProps) {
  const span = Math.min(field.span ?? 1, columns)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: field.id, disabled: readOnly })
  const name = field.label || (field.type === "divider" ? "جداکننده" : field.type === "paragraph" ? "متن راهنما" : field.id)
  const style: React.CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/field relative rounded-md border border-transparent p-1.5 transition-colors hover:border-border",
        className,
        selected && "border-primary bg-accent/30",
        invalid && "border-destructive",
        isDragging && "z-10 opacity-60"
      )}
    >
      {/* پوشش انتخاب روی پیش‌نمایش؛ خود پیش‌نمایش غیرتعاملی است (inert) */}
      <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`انتخاب «${name}»${invalid ? " (ایراد دارد)" : ""}`} className="absolute inset-0 z-[1] rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />
      {(field.visible_if !== undefined || field.required_if !== undefined || field.readonly_if !== undefined) && (
        <span className="absolute -top-2.5 start-2 z-[2] flex items-center gap-1 rounded-sm border bg-background px-1 text-2xs text-muted-foreground">
          <GitBranch className="size-3" aria-hidden /> شرطی
        </span>
      )}
      <div inert>
        <FieldView field={field} control={control} layout={layout} />
      </div>
      {!readOnly && (
        <div
          className={cn(
            "absolute -top-3 end-2 z-[2] flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm",
            selected ? "flex" : "hidden group-focus-within/field:flex group-hover/field:flex"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`جابه‌جایی «${name}» (Space و جهت‌ها)`}
            className="cursor-grab touch-none"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
          >
            <GripVertical />
          </Button>
          {columns > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-2xs"
              aria-label={`پهنای «${name}»: ${span >= columns ? "تمام عرض" : `${toFaDigits(span)} ستون`} (زدن برای تغییر)`}
              onClick={() => onFieldChange(field.id, (f) => ({ ...f, span: span >= columns ? 1 : span + 1 }), `span:${field.id}`)}
            >
              <MoveHorizontal /> {span >= columns ? "تمام عرض" : `${toFaDigits(span)} ستون`}
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`بالا بردن «${name}»`} onClick={() => onNudgeField(field.id, -1)}>
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`پایین بردن «${name}»`} onClick={() => onNudgeField(field.id, 1)}>
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`رونوشت «${name}»`} onClick={() => onDuplicateField(field.id)}>
            <Copy />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف «${name}»`} onClick={() => onRemoveField(field.id)}>
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  )
}
