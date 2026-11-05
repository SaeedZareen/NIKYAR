import * as React from "react"

export type Theme = "light" | "dark" | "system"
type Ctx = { theme: Theme; resolvedTheme: "light" | "dark"; setTheme: (theme: Theme) => void }

// همین کلید در index.html پیش از بارگذاری خوانده می‌شود تا صفحه با رنگ اشتباه چشمک نزند.
const STORAGE_KEY = "nikyar:theme"
const ThemeContext = React.createContext<Ctx | null>(null)
const media = () => window.matchMedia("(prefers-color-scheme: dark)")

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    return t === "light" || t === "dark" ? t : "system"
  } catch {
    return "system"
  }
}

/** پوسته‌ی روشن/تیره/مطابق سیستم با کلاس dark روی html. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(readTheme)
  const [systemDark, setSystemDark] = React.useState(() => media().matches)

  React.useEffect(() => {
    const m = media()
    const onChange = () => setSystemDark(m.matches)
    m.addEventListener("change", onChange)
    return () => m.removeEventListener("change", onChange)
  }, [])

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolvedTheme === "dark")
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const value = React.useMemo<Ctx>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (t) => {
        setThemeState(t)
        try {
          localStorage.setItem(STORAGE_KEY, t)
        } catch {
          // ذخیره‌نشدن ترجیح پوسته مانع کار نیست.
        }
      },
    }),
    [theme, resolvedTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
