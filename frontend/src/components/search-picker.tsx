import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type PickerOption = { value: string; label: string; hint?: string; depth?: number }

type Props = {
  id?: string
  options: PickerOption[]
  /** یک مقدار، یا فهرست مقدارها با multiple */
  value: string | string[]
  onChange: (value: string | string[]) => void
  multiple?: boolean
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  onBlur?: () => void
} & Pick<React.AriaAttributes, "aria-invalid" | "aria-describedby" | "aria-required" | "aria-label">

/**
 * انتخاب از فهرست محلی با جست‌وجو (فهرست پایه‌ی بلند، واحد سازمانی با تورفتگی درختی، سمت، شهر).
 * با multiple چند انتخاب با تیک، و نمایش انتخاب‌ها کنار هم با دکمه‌ی حذف هر کدام.
 */
export function SearchPicker({
  id,
  options,
  value,
  onChange,
  multiple,
  placeholder = "انتخاب کنید",
  searchPlaceholder = "جست‌وجو",
  emptyText = "موردی پیدا نشد.",
  disabled,
  onBlur,
  ...aria
}: Props) {
  const [open, setOpen] = React.useState(false)
  const selected = Array.isArray(value) ? value : value ? [value] : []
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const toggle = (v: string) => {
    if (!multiple) {
      onChange(v)
      setOpen(false)
      return
    }
    // ترتیب انتخاب‌ها همان ترتیب فهرست می‌ماند.
    onChange(options.map((o) => o.value).filter((o) => (o === v ? !selected.includes(v) : selected.includes(o))))
  }
  const summary = multiple ? (selected.length ? selected.map(labelOf).join("، ") : placeholder) : selected.length ? labelOf(selected[0]) : placeholder

  return (
    <div className="flex flex-col gap-1.5">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) onBlur?.()
        }}
      >
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal" {...aria}>
            <span className={cn("truncate", !selected.length && "text-muted-foreground")}>{summary}</span>
            <ChevronsUpDown className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ""} ${o.value}`} onSelect={() => toggle(o.value)}>
                    <Check className={cn(selected.includes(o.value) ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span style={o.depth ? { paddingInlineStart: `${o.depth * 0.75}rem` } : undefined}>{o.label}</span>
                    {o.hint && <span className="ms-auto text-2xs text-muted-foreground">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {multiple && selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="انتخاب‌ها">
          {selected.map((v) => (
            <li key={v} className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 ps-2 pe-0.5 text-xs">
              {labelOf(v)}
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف ${labelOf(v)}`} disabled={disabled} onClick={() => toggle(v)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
