import * as React from "react"
import { useDroppable } from "@dnd-kit/core"
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { FormGrid } from "@/components/form/form-grid"
import { spanClass, type FieldDef, type FormDefinition, type FormValues, type SectionDef } from "@/components/form-renderer/definition"
import { FieldView } from "@/components/form-renderer/form-renderer"
import { InfoTip } from "@/components/info-tip"
import { Button } from "@/components/ui/button"
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

function CanvasSection({ section, first, last, selection, invalid, readOnly, onSelect, onMoveSection, onRemoveSection, control, ...rest }: SectionProps) {
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
        {!readOnly && (
          <div className="ms-auto flex items-center gap-0.5">
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
      <div className="p-3">
        <SortableContext items={section.fields.map((f) => f.id)} strategy={rectSortingStrategy} disabled={readOnly}>
          <FormGrid columns={columns}>
            {section.fields.map((field) => (
              <CanvasField
                key={field.id}
                field={field}
                className={spanClass(field.span, columns)}
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

type FieldProps = Pick<Props, "onNudgeField" | "onDuplicateField" | "onRemoveField"> & {
  field: FieldDef
  className: string
  selected: boolean
  invalid: boolean
  readOnly: boolean
  control: SectionProps["control"]
  onSelect: () => void
}

function CanvasField({ field, className, selected, invalid, readOnly, control, onSelect, onNudgeField, onDuplicateField, onRemoveField }: FieldProps) {
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
      <div inert>
        <FieldView field={field} control={control} />
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
