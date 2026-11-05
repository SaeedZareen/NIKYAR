import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { useAuth } from "@/app/auth"
import { useLookupItems } from "@/app/lookups"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { DigitsInput } from "@/components/form/inputs"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { schemas } from "@/lib/validators"

type User = Schemas["User"]

const LABELS = {
  first_name: "نام",
  last_name: "نام خانوادگی",
  username: "نام کاربری",
  gender: "جنسیت",
  mobile: "موبایل",
  email: "ایمیل",
  password: "گذرواژه",
  roles: "نقش‌ها",
  is_active: "حساب فعال",
  is_superuser: "مدیر کل",
}

function userSchema(isNew: boolean) {
  return z.object({
    first_name: schemas.required("نام"),
    last_name: schemas.required("نام خانوادگی"),
    username: z
      .string()
      .trim()
      .min(1, "تکمیل «نام کاربری» الزامی است.")
      .regex(/^[\w.@+-]+$/, "نام کاربری فقط حروف لاتین، رقم و نویسه‌های . @ + - _ است."),
    gender: z.string(),
    mobile: z.union([z.literal(""), schemas.mobile]),
    email: z.union([z.literal(""), schemas.email]),
    password: isNew ? z.string().min(8, "گذرواژه دست‌کم ۸ نویسه باشد.") : z.union([z.literal(""), z.string().min(8, "گذرواژه دست‌کم ۸ نویسه باشد.")]),
    roles: z.array(z.number()),
    is_active: z.boolean(),
    is_superuser: z.boolean(),
  })
}

type Props = { user: User | null; open: boolean; onOpenChange: (open: boolean) => void }

/** پانل ایجاد/ویرایش کاربر. برای کاربر جدید user برابر null است. */
export function UserSheet({ user, open, onOpenChange }: Props) {
  const isNew = !user
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => unwrap(api.GET("/api/auth/roles/")) })
  const genders = useLookupItems("gender")
  const form = useAppForm(userSchema(isNew), {
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    username: user?.username ?? "",
    gender: user?.gender ?? "",
    mobile: user?.mobile ?? "",
    email: user?.email ?? "",
    password: "",
    roles: user?.roles ?? [],
    is_active: user?.is_active ?? true,
    is_superuser: user?.is_superuser ?? false,
  })

  const save = useMutation({
    // برای کاربر جدید فرم گذرواژه را الزامی کرده است؛ در ویرایش همه‌ی فیلدها اختیاری‌اند.
    mutationFn: (body: Schemas["PatchedUserRequest"]) =>
      isNew
        ? unwrap(api.POST("/api/auth/users/", { body: body as Schemas["UserRequest"] }))
        : unwrap(api.PATCH("/api/auth/users/{id}/", { params: { path: { id: user.id } }, body })),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success(isNew ? `کاربر «${saved.full_name}» ایجاد شد.` : `تغییرات «${saved.full_name}» ذخیره شد.`)
      onOpenChange(false)
    },
  })

  const onSubmit = form.handleSubmit(async ({ password, gender, ...values }) => {
    try {
      await save.mutateAsync({ ...values, gender: gender as Schemas["PatchedUserRequest"]["gender"], ...(password ? { password } : {}) })
    } catch (e) {
      applyServerErrors(form, e)
    }
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "کاربر جدید" : `ویرایش ${user.full_name}`}
      description={isNew ? "حساب کاربری تازه با نقش‌های لازم." : `نام کاربری: ${user.username}`}
      onSubmit={onSubmit}
      submitting={save.isPending}
    >
      <ErrorSummary errors={form.formState.errors} labels={LABELS} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField control={form.control} name="first_name" label="نام" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField control={form.control} name="last_name" label="نام خانوادگی" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="username"
          label="نام کاربری"
          required
          render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" spellCheck={false} {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="gender"
          label="جنسیت"
          description="برای عنوان خطاب (آقای / خانم)."
          render={({ field, id, aria }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full" {...aria}>
                <SelectValue placeholder="انتخاب کنید" />
              </SelectTrigger>
              <SelectContent>
                {(genders.data ?? []).map((g) => (
                  <SelectItem key={g.code} value={g.code}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormField control={form.control} name="mobile" label="موبایل" render={({ field, id, aria }) => <DigitsInput kind="mobile" id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="email"
          label="ایمیل"
          render={({ field, id, aria }) => <Input id={id} type="email" dir="ltr" autoComplete="off" {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="password"
          label={isNew ? "گذرواژه" : "گذرواژه‌ی جدید"}
          required={isNew}
          description={isNew ? "دست‌کم ۸ نویسه؛ کاربر پس از ورود می‌تواند آن را عوض کند." : "برای تغییر ندادن، خالی بگذارید."}
          render={({ field, id, aria }) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" {...field} {...aria} />}
        />
        <FormField
          control={form.control}
          name="roles"
          label="نقش‌ها"
          description="مجوزهای کاربر از نقش‌هایش می‌آید."
          group
          render={({ field, id, aria }) => (
            <div id={id} role="group" tabIndex={-1} className="flex flex-col gap-2 pt-1 outline-none" {...aria}>
              {(roles.data ?? []).map((r) => {
                const checked = field.value.includes(r.id)
                return (
                  <div key={r.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`role-${r.id}`}
                      checked={checked}
                      onCheckedChange={(v) => field.onChange(v ? [...field.value, r.id] : field.value.filter((x) => x !== r.id))}
                    />
                    <Label htmlFor={`role-${r.id}`} className="font-normal">
                      {r.name}
                    </Label>
                  </div>
                )
              })}
              {roles.data?.length === 0 && <p className="text-xs text-muted-foreground">هنوز نقشی تعریف نشده است.</p>}
            </div>
          )}
        />
        <FormField
          control={form.control}
          name="is_active"
          label="حساب فعال"
          render={({ field, id }) => (
            <div className="flex min-h-7 items-center gap-2">
              <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
              <span className="text-xs text-muted-foreground">{field.value ? "می‌تواند وارد شود" : "امکان ورود ندارد"}</span>
            </div>
          )}
        />
        {me?.is_superuser && (
          <FormField
            control={form.control}
            name="is_superuser"
            label="مدیر کل"
            render={({ field, id }) => (
              <div className="flex min-h-7 items-center gap-2">
                <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
                <span className="text-xs text-muted-foreground">همه‌ی مجوزها، بدون نیاز به نقش</span>
              </div>
            )}
          />
        )}
      </FormGrid>
    </FormSheet>
  )
}
