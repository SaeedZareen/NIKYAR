import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber } from "@/lib/format"
import { schemas } from "@/lib/validators"

type Role = Schemas["Role"]

const schema = z.object({
  name: schemas.required("عنوان نقش"),
  description: z.string().max(255, "توضیح حداکثر ۲۵۵ نویسه است."),
  permissions: z.array(z.string()),
})
const LABELS = { name: "عنوان نقش", description: "توضیح", permissions: "مجوزها" }

export function RoleSheet({ role, open, onOpenChange }: { role: Role | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const isNew = !role
  const qc = useQueryClient()
  const catalog = useQuery({ queryKey: ["permission-catalog"], queryFn: () => unwrap(api.GET("/api/auth/permissions/")), staleTime: Infinity })
  const form = useAppForm(schema, { name: role?.name ?? "", description: role?.description ?? "", permissions: role?.permissions ?? [] })

  const save = useMutation({
    mutationFn: (body: Schemas["RoleRequest"]) =>
      isNew ? unwrap(api.POST("/api/auth/roles/", { body })) : unwrap(api.PATCH("/api/auth/roles/{id}/", { params: { path: { id: role.id } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["roles"] })
      qc.invalidateQueries({ queryKey: ["session"] })
      toast.success(isNew ? `نقش «${saved.name}» ایجاد شد.` : `نقش «${saved.name}» ذخیره شد.`)
      onOpenChange(false)
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
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "نقش جدید" : `ویرایش نقش «${role.name}»`}
      description="کاربرانی که این نقش را دارند، همه‌ی مجوزهای انتخاب‌شده را می‌گیرند."
      onSubmit={onSubmit}
      submitting={save.isPending}
      size="wide"
    >
      <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
      <FieldGroup className="gap-3">
        <FormField control={form.control} name="name" label="عنوان نقش" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField control={form.control} name="description" label="توضیح" render={({ field, id, aria }) => <Textarea id={id} rows={2} {...field} {...aria} />} />
      </FieldGroup>
      <FormField
        control={form.control}
        name="permissions"
        label="مجوزها"
        layout="stacked"
        group
        render={({ field, id, aria }) =>
          catalog.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div id={id} role="group" tabIndex={-1} className="grid gap-3 outline-none sm:grid-cols-2" {...aria}>
              {(catalog.data ?? []).map((group) => {
                const codes = group.permissions.map((p) => p.code)
                const selected = codes.filter((c) => field.value.includes(c)).length
                const all = selected === codes.length
                return (
                  <FieldSet key={group.app} className="gap-2 rounded-lg border p-3">
                    <FieldLegend variant="label" className="flex w-full items-center gap-2">
                      <Checkbox
                        id={`group-${group.app}`}
                        checked={all ? true : selected > 0 ? "indeterminate" : false}
                        onCheckedChange={(v) => field.onChange(v ? [...new Set([...field.value, ...codes])] : field.value.filter((c) => !codes.includes(c)))}
                        aria-label={`همه‌ی مجوزهای ${group.title}`}
                      />
                      <span className="font-semibold">{group.title}</span>
                      <span className="ms-auto text-2xs font-normal text-muted-foreground">
                        {formatNumber(selected)} از {formatNumber(codes.length)}
                      </span>
                    </FieldLegend>
                    {group.permissions.map((p) => (
                      <div key={p.code} className="flex items-center gap-2 ps-6">
                        <Checkbox
                          id={`perm-${p.code}`}
                          checked={field.value.includes(p.code)}
                          onCheckedChange={(v) => field.onChange(v ? [...field.value, p.code] : field.value.filter((c) => c !== p.code))}
                        />
                        <Label htmlFor={`perm-${p.code}`} className="font-normal">
                          {p.label}
                        </Label>
                      </div>
                    ))}
                  </FieldSet>
                )
              })}
            </div>
          )
        }
      />
    </FormSheet>
  )
}
