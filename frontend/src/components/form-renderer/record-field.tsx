import * as React from "react"
import { Link } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDate, toEnDigits, toFaDigits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { asList, common, type FieldProps } from "./field-props"
import { recordLabel, useRecordNames } from "./record-names"

// «ارجاع به ثبت یا درخواست» (4.4b): انتخاب از ثبت‌های نهایی یک فرم یا درخواست‌های یک فرایند که کاربر می‌بیند.

type RecordItem = Schemas["RecordItem"]

const asIds = (value: unknown): number[] => asList(value).map(Number).filter((n) => !Number.isNaN(n))

export function RecordField(p: FieldProps) {
  const props = p.field.props ?? {}
  const source = String(props.source ?? "")
  const multiple = props.multiple === true
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => <RecordInput id={id} source={source} multiple={multiple} value={field.value} onChange={field.onChange} aria={aria} />}
    />
  )
}

function RecordInput({ id, source, multiple, value, onChange, aria }: { id: string; source: string; multiple: boolean; value: unknown; onChange: (v: unknown) => void; aria: object }) {
  const ids = asIds(value)
  const names = useRecordNames(source, ids).data ?? []
  const labelOf = (rid: number) => {
    const item = names.find((r) => r.id === rid)
    return item ? recordLabel(item) : "…"
  }
  if (!multiple) {
    const current = ids[0]
    return <RecordPicker id={id} source={source} selected={ids} label={current ? labelOf(current) : null} onPick={(r) => onChange(r.id)} onClear={current ? () => onChange("") : undefined} aria={aria} />
  }
  return (
    <div className="flex flex-col gap-1.5">
      <RecordPicker id={id} source={source} selected={ids} label={null} placeholder="افزودن" onPick={(r) => !ids.includes(r.id) && onChange([...ids, r.id])} aria={aria} />
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="موارد انتخاب‌شده">
          {ids.map((rid) => (
            <li key={rid} className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 ps-2 pe-0.5 text-xs tabular-nums">
              {labelOf(rid)}
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف ${labelOf(rid)}`} onClick={() => onChange(ids.filter((x) => x !== rid))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** جست‌وجوی شماره در سرور؛ بی جست‌وجو تازه‌ترین موارد. */
function RecordPicker({
  id,
  source,
  selected,
  label,
  placeholder = "انتخاب کنید",
  onPick,
  onClear,
  aria,
}: {
  id: string
  source: string
  selected: number[]
  label: string | null
  placeholder?: string
  onPick: (r: RecordItem) => void
  onClear?: () => void
  aria: object
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(toEnDigits(search.trim())), 250)
    return () => clearTimeout(t)
  }, [search])
  const found = useQuery({
    queryKey: ["forms", "record-lookup", source, debounced],
    queryFn: () => unwrap(api.GET("/api/forms/record-lookup/", { params: { query: { source, search: debounced || undefined } } })),
    enabled: open && !!source,
    placeholderData: keepPreviousData,
  })
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal" {...aria}>
            <span className={cn("truncate tabular-nums", !label && "text-muted-foreground")}>{label ?? placeholder}</span>
            <ChevronsUpDown className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="جست‌وجوی شماره" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{found.isFetching ? "در حال جست‌وجو…" : "موردی پیدا نشد."}</CommandEmpty>
              <CommandGroup>
                {(found.data ?? []).map((r) => (
                  <CommandItem
                    key={r.id}
                    value={String(r.id)}
                    onSelect={() => {
                      onPick(r)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn(selected.includes(r.id) ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="tabular-nums">{recordLabel(r)}</span>
                    <span className="ms-auto text-2xs text-muted-foreground">{[r.person, r.date ? formatDate(r.date) : ""].filter(Boolean).join(" · ")}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onClear && (
        <Button type="button" variant="ghost" size="icon" aria-label="پاک کردن انتخاب" title="پاک کردن انتخاب" onClick={onClear}>
          <X />
        </Button>
      )}
    </div>
  )
}

/** نمایش فقط‌خواندنی: شماره‌ها، با پیوند به صفحه‌ی مشاهده برای موارد دیدنی. */
export function RecordValue({ source, value }: { source: string; value: unknown }) {
  const ids = asIds(value)
  const names = useRecordNames(source, ids).data ?? []
  return (
    <span className="inline-flex flex-wrap gap-x-2 tabular-nums">
      {ids.map((rid, i) => {
        const item = names.find((r) => r.id === rid)
        const text = item ? recordLabel(item) : toFaDigits(rid)
        return (
          <span key={rid}>
            {item?.url ? (
              <Link to={item.url} className="text-primary hover:underline">
                {text}
              </Link>
            ) : (
              text
            )}
            {item?.person && <span className="text-2xs text-muted-foreground"> ({item.person})</span>}
            {i < ids.length - 1 && "،"}
          </span>
        )
      })}
    </span>
  )
}
