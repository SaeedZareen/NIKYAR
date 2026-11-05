import * as React from "react"
import { useNavigate } from "react-router"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useAuth } from "@/app/auth"
import { visibleNavigation } from "@/app/navigation"

/** جست‌وجوی سراسری (Ctrl+K): رفتن به بخش‌ها و فرمان‌های عمومی. */
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { user, can } = useAuth()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const run = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
      <CommandInput placeholder="نام بخش یا فرمان…" />
      <CommandList>
        <CommandEmpty>موردی پیدا نشد.</CommandEmpty>
        {visibleNavigation(can, !!user?.is_superuser).map((group) => (
          <CommandGroup key={group.title} heading={group.title}>
            {group.items.map((item) => (
              <CommandItem key={item.url} value={`${item.title} ${item.keywords ?? ""}`} onSelect={() => run(() => navigate(item.url))}>
                <item.icon aria-hidden />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="پوسته">
          <CommandItem value="پوسته روشن" onSelect={() => run(() => setTheme("light"))}>
            <Sun aria-hidden /> روشن
          </CommandItem>
          <CommandItem value="پوسته تیره" onSelect={() => run(() => setTheme("dark"))}>
            <Moon aria-hidden /> تیره
          </CommandItem>
          <CommandItem value="پوسته مطابق سیستم" onSelect={() => run(() => setTheme("system"))}>
            <Monitor aria-hidden /> مطابق سیستم
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
