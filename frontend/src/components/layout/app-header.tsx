import * as React from "react"
import { Link } from "react-router"
import { Monitor, Moon, Search, Sun } from "lucide-react"
import { useTheme, type Theme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { formatDate } from "@/lib/format"
import { CommandMenu } from "./command-menu"

const THEMES = [
  { value: "light", label: "روشن", icon: Sun },
  { value: "dark", label: "تیره", icon: Moon },
  { value: "system", label: "مطابق سیستم", icon: Monitor },
] as const

/** نوار بالای سرمه‌ای: منو، نام سامانه، جست‌وجوی سراسری، تاریخ و پوسته. */
export function AppHeader() {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [today] = React.useState(() => formatDate(new Date(), "full"))
  const { theme, setTheme } = useTheme()
  const ThemeIcon = THEMES.find((t) => t.value === theme)?.icon ?? Monitor

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 bg-header px-2 text-header-foreground">
      <SidebarTrigger className="text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground" />
      <Link to="/" className="flex items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-header-foreground/60">
        <span aria-hidden className="grid size-7 place-items-center rounded-md bg-header-foreground text-sm font-bold text-header">
          ن
        </span>
        <span className="text-sm font-bold">نیک‌یار</span>
      </Link>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="ms-auto hidden h-7 w-72 items-center gap-2 rounded-md bg-header-foreground/10 px-2 text-xs text-header-muted outline-none hover:bg-header-foreground/15 focus-visible:ring-2 focus-visible:ring-header-foreground/60 md:flex"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">جست‌وجوی بخش‌ها</span>
        <Kbd className="ms-auto bg-header-foreground/15 text-header-foreground" dir="ltr">
          Ctrl K
        </Kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="ms-auto text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground md:hidden"
        aria-label="جست‌وجوی بخش‌ها"
        onClick={() => setSearchOpen(true)}
      >
        <Search />
      </Button>

      <span className="hidden px-2 text-xs text-header-muted lg:inline">{today}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground" aria-label="انتخاب پوسته">
            <ThemeIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            {THEMES.map((t) => (
              <DropdownMenuRadioItem key={t.value} value={t.value}>
                <t.icon /> {t.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
