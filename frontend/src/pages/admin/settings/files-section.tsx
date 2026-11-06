import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Checkbox } from "@/components/ui/checkbox"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { useFilePolicy } from "@/lib/files"
import { onlyDigits } from "@/lib/format"
import { SettingsForm, SettingsLoader, type SectionInfo } from "./settings-form"

type FileSettings = Schemas["FileSettings"]
type Extension = Schemas["AllowedExtensionsEnum"]
const KEY = ["settings", "files"]

const schema = z.object({
  max_size_mb: z
    .string()
    .refine((v) => v !== "", "تکمیل «حداکثر حجم هر فایل» الزامی است.")
    .refine((v) => Number(v) >= 1 && Number(v) <= 200, "حجم باید بین ۱ تا ۲۰۰ مگابایت باشد."),
  allowed_extensions: z.array(z.string()).min(1, "دست‌کم یک نوع فایل را مجاز کنید."),
})
const LABELS = { max_size_mb: "حداکثر حجم هر فایل", allowed_extensions: "نوع‌های مجاز" }

export function FilesSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/files/")) })
  return <SettingsLoader section={section} query={query}>{(data) => <FilesForm section={section} data={data} />}</SettingsLoader>
}

function FilesForm({ section, data }: { section: SectionInfo; data: FileSettings }) {
  const qc = useQueryClient()
  const policy = useFilePolicy()
  const toForm = (d: FileSettings) => ({ max_size_mb: String(d.max_size_mb), allowed_extensions: d.allowed_extensions as string[] })
  const form = useAppForm(schema, toForm(data))
  const save = useMutation({
    mutationFn: (body: Schemas["FileSettingsRequest"]) => unwrap(api.PUT("/api/settings/files/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      qc.invalidateQueries({ queryKey: ["files", "policy"] })
      form.reset(toForm(saved))
      toast.success("تنظیمات فایل‌ها ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ max_size_mb: Number(v.max_size_mb), allowed_extensions: v.allowed_extensions as Extension[] })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      <FormField
        control={form.control}
        name="max_size_mb"
        label={LABELS.max_size_mb}
        required
        description="بین ۱ تا ۲۰۰ مگابایت."
        render={({ field, id, aria }) => (
          <InputGroup className="max-w-40">
            <InputGroupInput
              id={id}
              dir="ltr"
              inputMode="numeric"
              className="text-start tabular-nums"
              value={field.value}
              onChange={(e) => field.onChange(onlyDigits(e.target.value).slice(0, 3))}
              onBlur={field.onBlur}
              {...aria}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>مگابایت</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        )}
      />
      <FormField
        control={form.control}
        name="allowed_extensions"
        label={LABELS.allowed_extensions}
        required
        group
        className="col-span-full"
        description="SVG، HTML و فایل‌های اجرایی به دلیل خطر امنیتی هرگز پذیرفته نمی‌شوند."
        render={({ field, id, aria: { "aria-required": _required, ...aria } }) => (
          // نقش group ویژگی aria-required ندارد؛ الزامی بودن با ستاره‌ی برچسب و پیام خطا اعلام می‌شود.
          <div id={id} tabIndex={-1} role="group" className="grid gap-x-6 gap-y-2 pt-1 outline-none sm:grid-cols-2 xl:grid-cols-3" {...aria}>
            {(policy.data?.types ?? []).map((t) => (
              <div key={t.extension} className="flex items-center gap-2">
                <Checkbox
                  id={`ext-${t.extension}`}
                  checked={field.value.includes(t.extension)}
                  onCheckedChange={(v) => field.onChange(v ? [...field.value, t.extension] : field.value.filter((e) => e !== t.extension))}
                />
                <Label htmlFor={`ext-${t.extension}`} className="font-normal">
                  {t.label}{" "}
                  <bdi dir="ltr" className="text-muted-foreground">
                    .{t.extension}
                  </bdi>
                </Label>
              </div>
            ))}
          </div>
        )}
      />
    </SettingsForm>
  )
}
