import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { TimeInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { onlyDigits } from "@/lib/format"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"

type Backup = Schemas["BackupSettings"]
const KEY = ["settings", "backup"]

const schema = z.object({
  daily: z.boolean(),
  daily_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "ساعت را به شکل ۰۲:۰۰ وارد کنید."),
  keep: z.string().refine((v) => Number(v) >= 1 && Number(v) <= 90, "بین ۱ تا ۹۰ نسخه."),
})
const LABELS = { daily: "پشتیبان روزانه", daily_time: "ساعت پشتیبان روزانه", keep: "تعداد نسخه‌های نگهداری‌شده" }
const toForm = (b: Backup) => ({ daily: b.daily, daily_time: b.daily_time, keep: String(b.keep) })

export function BackupSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/backup/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <BackupForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function BackupForm({ section, data }: { section: SectionInfo; data: Backup }) {
  const qc = useQueryClient()
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["BackupSettingsRequest"]) => unwrap(api.PUT("/api/settings/backup/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      qc.invalidateQueries({ queryKey: ["jobs"] })
      form.reset(toForm(saved))
      toast.success("تنظیمات پشتیبان‌گیری ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ ...v, keep: Number(v.keep) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  const daily = form.watch("daily")

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <FormField
        control={form.control}
        name="daily"
        label={LABELS.daily}
        description="پشتیبان روزانه‌ی خودکار برای نصب سازمانی ضروری است؛ بدون آن، خرابی دیسک یعنی از دست رفتن همه‌ی اطلاعات."
        render={({ field, id }) => (
          <div className="flex min-h-7 items-center gap-2">
            <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
            <span className="text-xs text-muted-foreground">{field.value ? "روشن" : "خاموش"}</span>
          </div>
        )}
      />
      <FormField
        control={form.control}
        name="daily_time"
        label={LABELS.daily_time}
        description="ساعتی که سامانه کم‌کار است، مثل ۰۲:۰۰ بامداد. سرور باید در این ساعت روشن باشد."
        render={({ field, id, aria }) => <TimeInput id={id} disabled={!daily} {...field} {...aria} />}
      />
      <FormField
        control={form.control}
        name="keep"
        label={LABELS.keep}
        description="پشتیبان‌های روزانه‌ی قدیمی‌تر خودکار حذف می‌شوند؛ پشتیبان‌های دستی و «پیش از بازیابی» دست نمی‌خورند."
        render={({ field, id, aria }) => (
          <Input
            id={id}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            className="max-w-24 text-start tabular-nums"
            value={field.value}
            onChange={(e) => field.onChange(onlyDigits(e.target.value).slice(0, 2))}
            onBlur={field.onBlur}
            {...aria}
          />
        )}
      />
    </SettingsForm>
  )
}
