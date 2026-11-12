import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { api, unwrap } from "@/lib/api/client"
import { toEnDigits } from "@/lib/format"
import { cn } from "@/lib/utils"

type Picked = { id: number; name: string }

type Props = {
  id?: string
  value: Picked | null
  onChange: (user: Picked | null) => void
  placeholder?: string
  /** فقط کارکنان یک واحد (با زیرواحدها) یا دارندگان یک نقش. */
  filters?: { unit?: number; role?: number }
} & Pick<React.AriaAttributes, "aria-invalid" | "aria-describedby" | "aria-label">

/** انتخاب کاربر فعال با جست‌وجو در سرور (نام، نام کاربری، موبایل)؛ برای هر کاربر واردشده (بدون مجوز فهرست کاربران). */
export function UserPicker({ id, value, onChange, placeholder = "انتخاب کاربر", filters, ...aria }: Props) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(toEnDigits(search.trim())), 250)
    return () => clearTimeout(t)
  }, [search])

  const users = useQuery({
    queryKey: ["users", "picker", debounced, filters?.unit, filters?.role],
    queryFn: () => unwrap(api.GET("/api/auth/user-lookup/", { params: { query: { search: debounced || undefined, unit: filters?.unit, role: filters?.role } } })),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal" {...aria}>
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value?.name ?? placeholder}</span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="نام، نام کاربری یا موبایل" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{users.isFetching ? "در حال جست‌وجو…" : "کاربری پیدا نشد."}</CommandEmpty>
            <CommandGroup>
              {(users.data ?? []).map((u) => (
                <CommandItem
                  key={u.id}
                  value={String(u.id)}
                  onSelect={() => {
                    onChange({ id: u.id, name: u.full_name })
                    setOpen(false)
                  }}
                >
                  <Check className={cn(value?.id === u.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span>{u.full_name}</span>
                  <span className="ms-auto text-muted-foreground" dir="ltr">
                    {u.username}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
