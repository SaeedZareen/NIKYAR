import type { ReactNode } from "react"
import { useFieldArray, useFormState, type Control } from "react-hook-form"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { fieldId } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { InfoTip } from "@/components/info-tip"
import { Button } from "@/components/ui/button"
import { useMinWidth } from "@/hooks/use-mobile"
import { formatNumber, toFaDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { itemsOf, toItem, type FieldDef, type FormValues } from "./definition"
import { str, type FieldProps } from "./field-props"
import { FieldView } from "./form-renderer"

// گروه تکرارشونده (3.6): یک داده (فهرست مورد) با سه نمایش؛ هر خانه همان کنترل نوع خودش است.

type Item = { index: number; key: string }

/** گروه تکرارشونده: جدول، کارت (فرم کوچک برای هر مورد) یا فهرست ساده‌ی + / −. */
export function GroupField({ field, control, className }: FieldProps) {
  const props = field.props ?? {}
  const items = itemsOf(field)
  const itemLabel = str(props.item_label) || "ردیف"
  const max = Number(props.max_rows ?? 50)
  const wide = useMinWidth(768)
  // جدول روی صفحه‌ی باریک خودکار کارتی می‌شود
  const display = props.display === "list" ? "list" : props.display === "cards" || !wide ? "cards" : "table"
  const { fields: rows, append, remove, move } = useFieldArray({ control, name: field.id as never })
  const { errors } = useFormState({ control, name: field.id })
  const groupError = (errors[field.id] as { message?: string } | undefined)?.message
  const id = fieldId(field.id)
  const label = field.label ?? ""
  const list: Item[] = rows.map((r, index) => ({ index, key: r.id }))
  const actions = (i: number) => <ItemActions index={i} count={rows.length} itemLabel={itemLabel} onMove={move} onRemove={remove} />

  return (
    <div role="group" id={id} tabIndex={-1} aria-labelledby={`${id}-label`} aria-describedby={groupError ? `${id}-error` : undefined} className={cn("flex min-w-0 flex-col gap-2 outline-none", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span id={`${id}-label`} className="text-xs/relaxed font-medium">
          {label}
        </span>
        {field.required && (
          <span className="-ms-1.5 text-xs/relaxed text-destructive" aria-hidden>
            *
          </span>
        )}
        {field.help && <InfoTip label={`راهنمای ${label}`}>{field.help}</InfoTip>}
        <span className="text-2xs text-muted-foreground">
          {formatNumber(rows.length)} {itemLabel}
          {props.max_rows !== undefined && ` از حداکثر ${formatNumber(max)}`}
        </span>
      </div>

      {display === "table" && rows.length > 0 && <GroupTable field={field} items={items} list={list} control={control} itemLabel={itemLabel} actions={actions} />}
      {display === "cards" &&
        list.map(({ index, key }) => (
          <div key={key} role="group" aria-label={`${itemLabel} ${toFaDigits(index + 1)}`} className="rounded-md border">
            <div className="flex min-h-8 items-center gap-2 border-b bg-muted/50 px-3 py-1">
              <span className="text-xs font-medium">
                {itemLabel} {toFaDigits(index + 1)}
              </span>
              <div className="ms-auto">{actions(index)}</div>
            </div>
            <div className="p-3">
              <CardBody field={field} items={items} index={index} control={control} columns={wide ? Number(props.card_columns ?? 2) : 1} />
            </div>
          </div>
        ))}
      {display === "list" &&
        list.map(({ index, key }) => (
          <div key={key} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <FieldView field={cell(field, items[0], index, `${items[0]?.label ?? ""} ${toFaDigits(index + 1)}`)} control={control} layout="cell" />
            </div>
            {actions(index)}
          </div>
        ))}

      {rows.length === 0 && <p className="rounded-md border border-dashed px-3 py-3 text-center text-2xs text-muted-foreground">هنوز {itemLabel}ی اضافه نشده است.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={rows.length >= max} onClick={() => append(toItem(items) as never)}>
          <Plus /> افزودن {itemLabel}
        </Button>
      </div>
      {groupError && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {groupError}
        </p>
      )}
    </div>
  )
}

/** یک خانه: همان فیلد مورد با نام «گروه.شماره.فیلد» در داده‌ی فرم. */
function cell(group: FieldDef, item: FieldDef | undefined, index: number, label: string): FieldDef {
  return { ...(item as FieldDef), id: `${group.id}.${index}.${item?.id}`, label }
}

function GroupTable({ field, items, list, control, itemLabel, actions }: { field: FieldDef; items: FieldDef[]; list: Item[]; control: Control<FormValues>; itemLabel: string; actions: (i: number) => ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="w-8 px-2 py-1.5 text-start font-medium">
              <span className="sr-only">{itemLabel}</span>#
            </th>
            {items.map((item) => (
              <th key={item.id} scope="col" className="px-2 py-1.5 text-start font-medium">
                <span className="inline-flex items-center gap-1">
                  {item.label}
                  {item.required && (
                    <span className="text-destructive" aria-hidden>
                      *
                    </span>
                  )}
                  {item.help && <InfoTip label={`راهنمای ${item.label}`}>{item.help}</InfoTip>}
                </span>
              </th>
            ))}
            <th scope="col" className="w-px px-2 py-1.5">
              <span className="sr-only">کارها</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map(({ index, key }) => (
            <tr key={key} className="border-t align-top">
              <td className="px-2 py-2 text-muted-foreground tabular-nums">{toFaDigits(index + 1)}</td>
              {items.map((item) => (
                <td key={item.id} className="min-w-36 px-1 py-1">
                  <FieldView field={cell(field, item, index, `${item.label} ${itemLabel} ${toFaDigits(index + 1)}`)} control={control} layout="cell" />
                </td>
              ))}
              <td className="px-1 py-1">{actions(index)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CardBody({ field, items, index, control, columns }: { field: FieldDef; items: FieldDef[]; index: number; control: Control<FormValues>; columns: number }) {
  const cols = Math.min(Math.max(columns, 1), 3) as 1 | 2 | 3
  return (
    <FormGrid columns={cols} fixed>
      {items.map((item) => (
        <FieldView key={item.id} field={cell(field, item, index, item.label ?? "")} control={control} layout={cols >= 2 ? "stacked" : "side"} />
      ))}
    </FormGrid>
  )
}

function ItemActions({ index, count, itemLabel, onMove, onRemove }: { index: number; count: number; itemLabel: string; onMove: (from: number, to: number) => void; onRemove: (i: number) => void }) {
  const name = `${itemLabel} ${toFaDigits(index + 1)}`
  return (
    <div className="flex items-center gap-0.5">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`بالا بردن ${name}`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`پایین بردن ${name}`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف ${name}`} onClick={() => onRemove(index)}>
        <Trash2 />
      </Button>
    </div>
  )
}
