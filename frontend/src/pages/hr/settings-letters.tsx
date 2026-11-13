import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { FormField } from "@/components/form/form-field"
import { applyServerErrors } from "@/components/form/server-errors"
import { TokenInput } from "@/components/form/token-input"
import { useAppForm } from "@/components/form/use-app-form"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { SettingsForm, SettingsLoader, type SectionInfo } from "@/pages/admin/settings/settings-form"

type Letters = Schemas["HrLettersSettings"]
type Name = keyof Letters
const KEY = ["settings", "hr-letters"]
const LABELS: Record<Name, string> = { employment: "گواهی اشتغال به کار", introduction: "معرفی‌نامه", deduction: "گواهی کسر از حقوق", experience: "گواهی سابقه‌ی کار" }
const NAMES = Object.keys(LABELS) as Name[]
const text = (label: string) => z.string().trim().min(1, `متن «${label}» خالی است.`).max(3000, "متن حداکثر ۳۰۰۰ نویسه است.")
const schema = z.object(Object.fromEntries(NAMES.map((n) => [n, text(LABELS[n])])) as Record<Name, ReturnType<typeof text>>)

export function HrLettersSection({ section }: { section: SectionInfo }) {
  const query = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings/hr-letters/")) })
  return (
    <SettingsLoader section={section} query={query}>
      {(data) => <LettersForm section={section} data={data} />}
    </SettingsLoader>
  )
}

function LettersForm({ section, data }: { section: SectionInfo; data: Letters }) {
  const qc = useQueryClient()
  const tokens = useQuery({ queryKey: ["hr", "letter-placeholders"], queryFn: () => unwrap(api.GET("/api/hr/letters/placeholders/")), staleTime: Infinity }).data ?? []
  const form = useAppForm(schema, data)
  const save = useMutation({
    mutationFn: (body: Schemas["HrLettersSettingsRequest"]) => unwrap(api.PUT("/api/settings/hr-letters/", { body })),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved)
      form.reset(saved)
      toast.success("متن نامه‌ها ذخیره شد.")
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <SettingsForm section={section} form={form} labels={LABELS} onSubmit={onSubmit} saving={save.isPending}>
      {NAMES.map((name) => (
        <FormField
          key={name}
          control={form.control}
          name={name}
          label={LABELS[name]}
          required
          className="col-span-full"
          description="با دکمه‌های زیر فیلد، جای‌گذار مشخصات کارمند (نام، کد ملی، سمت…) یا فرم درخواست (گیرنده، مبلغ) را درج کنید. هر خط تازه در چاپ هم خط تازه است."
          render={({ field, id, aria }) => (
            <TokenInput
              id={id}
              multiline
              maxLength={3000}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              tokens={tokens}
              tokensLabel={`افزودن جای‌گذار به ${LABELS[name]}`}
              {...aria}
            />
          )}
        />
      ))}
    </SettingsForm>
  )
}
