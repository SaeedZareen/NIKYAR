import * as React from "react"
import { Link, useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Bell, CheckCheck } from "lucide-react"
import { NOTIFICATIONS_KEY, useMarkAllRead, useMarkRead, useUnreadCount, type Notification } from "@/app/notifications"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { api, unwrap } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

const LATEST = 8

/** زنگوله‌ی نوار بالا: شمار خوانده‌نشده‌ها و آخرین اعلان‌ها؛ زدن هر اعلان آن را خوانده می‌کند و به صفحه‌اش می‌برد. */
export function NotificationBell() {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()
  const unread = useUnreadCount().data ?? 0
  const latest = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "latest"],
    queryFn: () => unwrap(api.GET("/api/notifications/", { params: { query: { page_size: LATEST } } })),
    enabled: open,
  })
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  const openItem = (n: Notification) => {
    if (!n.is_read) markRead.mutate(n.id)
    setOpen(false)
    if (n.url) navigate(n.url)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
          aria-label={unread ? `اعلان‌ها، ${formatNumber(unread)} خوانده‌نشده` : "اعلان‌ها"}
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-2xs leading-none font-bold text-white tabular-nums"
            >
              {unread > 99 ? "۹۹+" : formatNumber(unread)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="اعلان‌ها" className="w-[min(24rem,calc(100vw-1rem))] gap-0 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">اعلان‌ها</h2>
          {unread > 0 && <span className="text-2xs text-muted-foreground">{formatNumber(unread)} خوانده‌نشده</span>}
          <Button variant="ghost" size="sm" className="ms-auto" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
            <CheckCheck /> همه خوانده شد
          </Button>
        </div>
        <div className="max-h-[min(24rem,60svh)] overflow-y-auto">
          {latest.isPending ? (
            <div role="status" aria-label="در حال بارگذاری" className="flex flex-col gap-2 p-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : latest.data?.results.length ? (
            <ul aria-label="آخرین اعلان‌ها" className="divide-y">
              {latest.data.results.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full gap-2 px-3 py-2 text-start text-xs outline-none hover:bg-muted focus-visible:bg-muted",
                      !n.is_read && "bg-accent/40"
                    )}
                  >
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-primary")} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn(!n.is_read && "font-semibold")}>
                        {!n.is_read && <span className="sr-only">خوانده‌نشده: </span>}
                        {n.text}
                      </span>
                      <span className="text-2xs text-muted-foreground tabular-nums">{formatDateTime(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-xs text-muted-foreground">اعلانی ندارید.</p>
          )}
        </div>
        <div className="border-t p-1">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link to="/notifications" onClick={() => setOpen(false)}>
              همه‌ی اعلان‌ها
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
