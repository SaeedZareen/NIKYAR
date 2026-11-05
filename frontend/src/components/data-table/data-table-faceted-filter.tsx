import type { Column, RowData } from "@tanstack/react-table"
import { Check, PlusCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DataTableFeatures, FilterOption } from "./use-data-table"

type Props<TData extends RowData> = {
  column: Column<DataTableFeatures, TData, unknown>
  title: string
  options: FilterOption[]
  /** شمارش هر گزینه فقط وقتی داده در مرورگر است معنا دارد. */
  showCounts: boolean
}

/** فیلتر چندانتخابی ستون با جست‌وجو و شمارش هر گزینه. */
export function DataTableFacetedFilter<TData extends RowData>({ column, title, options, showCounts }: Props<TData>) {
  const counts = showCounts ? column.getFacetedUniqueValues() : undefined
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? [])

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    column.setFilterValue(next.size ? [...next] : undefined)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="border-dashed">
          <PlusCircle aria-hidden />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              {selected.size > 2 ? (
                <Badge variant="secondary">{formatNumber(selected.size)} مورد</Badge>
              ) : (
                options
                  .filter((o) => selected.has(o.value))
                  .map((o) => (
                    <Badge key={o.value} variant="secondary">
                      {o.label}
                    </Badge>
                  ))
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>موردی پیدا نشد.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const isSelected = selected.has(o.value)
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)} data-checked={isSelected}>
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-primary",
                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                      )}
                      aria-hidden
                    >
                      <Check className="size-3" />
                    </span>
                    {o.icon && <o.icon className="text-muted-foreground" />}
                    <span>{o.label}</span>
                    {counts?.get(o.value) && (
                      <span className="ms-auto text-muted-foreground tabular-nums">{formatNumber(counts.get(o.value))}</span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => column.setFilterValue(undefined)} className="justify-center">
                    پاک‌کردن فیلتر
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
