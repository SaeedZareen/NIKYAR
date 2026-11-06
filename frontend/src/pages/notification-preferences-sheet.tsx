import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CHANNELS, NOTIFICATIONS_KEY, type Channel } from "@/app/notifications"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"

type Preferences = Schemas["Preferences"]
const KEY = [...NOTIFICATIONS_KEY, "preferences"]

/** انتخاب کاربر: هر نوع اعلان علاوه بر سامانه با پیامک یا ایمیل هم برسد؛ هر تغییر همان لحظه ذخیره می‌شود. */
export function NotificationPreferencesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const prefs = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/notifications/preferences/")), enabled: open })
  const onSaved = (data: Preferences) => qc.setQueryData(KEY, data)
  const update = useMutation({
    mutationFn: ({ kind, channels }: { kind: string; channels: Channel[] }) =>
      unwrap(api.PATCH("/api/notifications/preferences/{kind}/", { params: { path: { kind } }, body: { channels } })),
    onSuccess: onSaved,
    onError: (e) => toast.error(errorMessage(e)),
  })
  const reset = useMutation({
    mutationFn: (kind: string) => unwrap(api.DELETE("/api/notifications/preferences/{kind}/", { params: { path: { kind } } })),
    onSuccess: onSaved,
    onError: (e) => toast.error(errorMessage(e)),
  })
  const status = Object.fromEntries((prefs.data?.channels ?? []).map((c) => [c.channel, c]))
  const notes = (prefs.data?.channels ?? []).flatMap((c) =>
    !c.available
      ? [`${c.label} در این سامانه هنوز راه‌اندازی نشده است.`]
      : !c.address
        ? [c.channel === "sms" ? "شماره‌ی موبایل شما ثبت نشده؛ پیامک دریافت نمی‌کنید." : "نشانی ایمیل شما ثبت نشده؛ ایمیل دریافت نمی‌کنید."]
        : []
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="gap-0 p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-md">
        <SheetHeader className="border-b bg-muted/50 py-3">
          <SheetTitle className="text-sm">دریافت اعلان با پیامک و ایمیل</SheetTitle>
          <SheetDescription className="text-2xs">اعلان درون سامانه همیشه می‌رسد؛ اینجا انتخاب می‌کنید کدام اعلان‌ها با پیامک یا ایمیل هم بیایند.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {notes.length > 0 && (
            <Alert>
              <AlertDescription>
                <ul className="list-disc ps-4">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {prefs.data ? (
            <ul aria-label="نوع‌های اعلان" className="flex flex-col divide-y rounded-md border">
              {prefs.data.kinds.map((k) => (
                <li key={k.kind} className="flex flex-col gap-2 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{k.title}</span>
                    {k.is_custom ? (
                      <Button variant="ghost" size="sm" className="ms-auto" disabled={reset.isPending} onClick={() => reset.mutate(k.kind)}>
                        پیش‌فرض سازمان
                      </Button>
                    ) : (
                      <span className="ms-auto text-2xs text-muted-foreground">پیش‌فرض سازمان</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {CHANNELS.map((c) => {
                      const id = `pref-${k.kind}-${c.value}`
                      const usable = status[c.value]?.available && !!status[c.value]?.address
                      return (
                        <div key={c.value} className="flex items-center gap-2">
                          <Switch
                            id={id}
                            checked={usable && k.channels.includes(c.value)}
                            disabled={!usable || update.isPending}
                            onCheckedChange={(v) =>
                              update.mutate({ kind: k.kind, channels: (v ? [...k.channels, c.value] : k.channels.filter((x) => x !== c.value)) as Channel[] })
                            }
                            aria-label={`${c.label} برای «${k.title}»`}
                          />
                          <label htmlFor={id} className="text-xs">
                            {c.label}
                            {status[c.value]?.address && <bdi className="ms-1 text-2xs text-muted-foreground">({toFaDigits(status[c.value].address)})</bdi>}
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div role="status" aria-label="در حال بارگذاری" className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
