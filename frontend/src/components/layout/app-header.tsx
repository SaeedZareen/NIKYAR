import * as React from "react"
import { Link, useNavigate } from "react-router"
import { KeyRound, LogOut, Monitor, Moon, Search, Sun } from "lucide-react"
import { useAuth, useLogout } from "@/app/auth"
import { useBranding } from "@/app/branding"
import { useTheme, type Theme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { formatDate } from "@/lib/format"
import { BrandMark } from "./brand-mark"
import { ChangePasswordDialog } from "./change-password-dialog"
import { CommandMenu } from "./command-menu"

const THEMES = [
  { value: "light", label: "روشن", icon: Sun },
  { value: "dark", label: "تیره", icon: Moon },
  { value: "system", label: "مطابق سیستم", icon: Monitor },
] as const

/** نوار بالای سرمه‌ای: منو، نام سامانه و سازمان، جست‌وجوی سراسری، تاریخ، پوسته و منوی کاربر. */
export function AppHeader() {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [today] = React.useState(() => formatDate(new Date(), "full"))
  const { theme, setTheme } = useTheme()
  const { name: orgName, shortName } = useBranding()
  const ThemeIcon = THEMES.find((t) => t.value === theme)?.icon ?? Monitor

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 bg-header px-2 text-header-foreground">
      <SidebarTrigger className="text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground" />
      <Link to="/" className="flex items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-header-foreground/60">
        <BrandMark className="size-7 text-sm" />
        <span className="text-sm font-bold">نیک‌یار</span>
      </Link>
      {shortName && (
        <span title={orgName} className="hidden max-w-60 truncate border-s border-header-foreground/25 ps-2 text-xs text-header-muted sm:inline">
          {shortName}
        </span>
      )}

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

      <UserMenu />
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}

function UserMenu() {
  const { user } = useAuth()
  const logout = useLogout()
  const navigate = useNavigate()
  const [passwordOpen, setPasswordOpen] = React.useState(false)
  if (!user) return null
  const initial = (user.first_name || user.username).charAt(0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 gap-2 px-1.5 text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
            aria-label={`حساب کاربری: ${user.full_name}`}
          >
            <span aria-hidden className="grid size-6 place-items-center rounded-full bg-header-foreground/20 text-xs font-bold">
              {initial}
            </span>
            <span className="hidden text-xs md:inline">{user.full_name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground">{user.title}</span>
            <span className="font-normal" dir="ltr">
              {user.username}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound /> تغییر گذرواژه
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
          >
            <LogOut /> خروج
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  )
}
