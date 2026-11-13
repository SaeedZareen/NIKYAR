import * as React from "react"
import { Link } from "react-router"
import { useWatch } from "react-hook-form"
import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import { useAuth } from "@/app/auth"
import { useLookupItems } from "@/app/lookups"
import { FormField, StaticField } from "@/components/form/form-field"
import { AttachmentList, FileDropzone } from "@/components/files"
import { RegionInput, type RegionValue } from "@/components/region-input"
import { SearchPicker, type PickerOption } from "@/components/search-picker"
import { useUnitOptions, useUserNames } from "./org-options"
import { SignaturePad } from "@/components/signature-pad"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserPicker } from "@/components/user-picker"
import { api, unwrap } from "@/lib/api/client"
import { useFileInfo, type StoredFile } from "@/lib/files"
import { cn } from "@/lib/utils"
import { optionColumnsClass } from "./definition"
import { asList, common, str, type FieldProps } from "./field-props"

// نوع‌های 3.3b: داده‌های سامانه (فهرست پایه، کاربر، واحد، سمت)، استان و شهر، مشخصات ثبت‌کننده، پیوست و امضا.

const asIds = (value: unknown): number[] => asList(value).map(Number)

/** فهرست پایه: نمایش خودکار به اندازه‌ی فهرست (دکمه تا ۵ مورد، کشویی تا ۱۵، سپس جست‌وجوپذیر)؛ یکی یا چند. */
export function LookupField(p: FieldProps) {
  const props = p.field.props ?? {}
  const multiple = props.multiple === true
  const items = useLookupItems(String(props.list ?? "")).data ?? []
  const options = items.map((i) => ({ value: i.code, label: i.title }))
  const display = props.display && props.display !== "auto" ? props.display : options.length <= 5 ? "buttons" : options.length <= 15 && !multiple ? "select" : "search"
  return (
    <FormField
      {...common(p)}
      group={display === "buttons"}
      render={({ field, id, aria }) => {
        if (display === "buttons") return <ButtonChoices id={id} options={options} multiple={multiple} value={field.value} onChange={field.onChange} onBlur={field.onBlur} aria={aria} columns={props.option_columns} />
        if (display === "select" && !multiple)
          return (
            <Select value={str(field.value)} onValueChange={field.onChange}>
              <SelectTrigger id={id} className="w-full" onBlur={field.onBlur} {...aria}>
                <SelectValue placeholder="انتخاب کنید" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        return <SearchPicker id={id} options={options} multiple={multiple} value={multiple ? asList(field.value) : str(field.value)} onChange={field.onChange} onBlur={field.onBlur} {...aria} />
      }}
    />
  )
}

type ButtonChoicesProps = {
  id: string
  options: PickerOption[]
  multiple: boolean
  value: unknown
  onChange: (value: unknown) => void
  onBlur: () => void
  aria: Record<string, unknown>
  columns?: unknown
}

/** گزینه‌های کوتاه: دکمه‌ی رادیویی برای یکی، چک‌باکس برای چند. */
function ButtonChoices({ id, options, multiple, value, onChange, onBlur, aria, columns }: ButtonChoicesProps) {
  if (!multiple)
    return (
      <RadioGroup id={id} tabIndex={-1} value={str(value)} onValueChange={onChange} className={cn("min-h-7", optionColumnsClass(columns))} {...aria}>
        {options.map((o) => (
          <div key={o.value} className="flex items-center gap-2">
            <RadioGroupItem value={o.value} id={`${id}-${o.value}`} onBlur={onBlur} />
            <Label htmlFor={`${id}-${o.value}`} className="font-normal">
              {o.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    )
  const selected = asList(value)
  // role=group خصیصه‌ی aria-required نمی‌پذیرد.
  const { "aria-required": _required, ...groupAria } = aria
  return (
    <div id={id} role="group" tabIndex={-1} className={cn("min-h-7 outline-none", optionColumnsClass(columns))} {...groupAria}>
      {options.map((o) => (
        <div key={o.value} className="flex items-center gap-2">
          <Checkbox
            id={`${id}-${o.value}`}
            checked={selected.includes(o.value)}
            onBlur={onBlur}
            onCheckedChange={(c) => onChange(options.map((x) => x.value).filter((v) => (v === o.value ? c === true : selected.includes(v))))}
          />
          <Label htmlFor={`${id}-${o.value}`} className="font-normal">
            {o.label}
          </Label>
        </div>
      ))}
    </div>
  )
}

/** کاربر: جست‌وجوی نام (محدود به واحد یا نقش اگر تعیین شده)؛ با multiple چند کاربر با دکمه‌ی حذف هر کدام. */
export function UserField(p: FieldProps) {
  const props = p.field.props ?? {}
  const multiple = props.multiple === true
  const filters = { unit: typeof props.unit === "number" ? props.unit : undefined, role: typeof props.role === "number" ? props.role : undefined }
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => <UserValue id={id} multiple={multiple} filters={filters} value={field.value} onChange={field.onChange} aria={aria} />}
    />
  )
}

type UserValueProps = { id: string; multiple: boolean; filters: { unit?: number; role?: number }; value: unknown; onChange: (v: unknown) => void; aria: object }

function UserValue({ id, multiple, filters, value, onChange, aria }: UserValueProps) {
  const ids = asIds(value)
  const names = useUserNames(ids).data ?? []
  const nameOf = (uid: number) => names.find((u) => u.id === uid)?.full_name ?? "…"
  if (!multiple) {
    const current = ids[0]
    return <UserPicker id={id} filters={filters} value={current ? { id: current, name: nameOf(current) } : null} onChange={(u) => onChange(u ? u.id : "")} {...aria} />
  }
  return (
    <div className="flex flex-col gap-1.5">
      <UserPicker id={id} filters={filters} placeholder="افزودن کاربر" value={null} onChange={(u) => u && !ids.includes(u.id) && onChange([...ids, u.id])} {...aria} />
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="کاربران انتخاب‌شده">
          {ids.map((uid) => (
            <li key={uid} className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 ps-2 pe-0.5 text-xs">
              {nameOf(uid)}
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف ${nameOf(uid)}`} onClick={() => onChange(ids.filter((x) => x !== uid))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OrgUnitField(p: FieldProps) {
  const multiple = p.field.props?.multiple === true
  const options = useUnitOptions()
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => (
        <SearchPicker
          id={id}
          options={options}
          multiple={multiple}
          value={asList(field.value)}
          onChange={(v) => field.onChange(Array.isArray(v) ? v.map(Number) : v ? Number(v) : "")}
          onBlur={field.onBlur}
          placeholder="انتخاب واحد"
          {...aria}
        />
      )}
    />
  )
}

export function PositionField(p: FieldProps) {
  const multiple = p.field.props?.multiple === true
  const unit = typeof p.field.props?.unit === "number" ? p.field.props.unit : undefined
  const positions = useQuery({
    queryKey: ["org", "position-lookup", unit],
    queryFn: () => unwrap(api.GET("/api/org/position-lookup/", { params: { query: { unit } } })),
    staleTime: 5 * 60_000,
  }).data
  const options = (positions ?? []).map((x) => ({ value: String(x.id), label: x.title, hint: x.unit_name }))
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => (
        <SearchPicker
          id={id}
          options={options}
          multiple={multiple}
          value={asList(field.value)}
          onChange={(v) => field.onChange(Array.isArray(v) ? v.map(Number) : v ? Number(v) : "")}
          onBlur={field.onBlur}
          placeholder="انتخاب سمت"
          {...aria}
        />
      )}
    />
  )
}

/** استان و شهر (یا شهرستان): با انتخاب استان، فقط شهرهای همان استان. */
export function RegionField(p: FieldProps) {
  const level = p.field.props?.level === "county" ? "counties" : "cities"
  return (
    <FormField
      {...common(p)}
      render={({ field, id, aria }) => (
        <RegionInput
          id={id}
          value={(field.value && typeof field.value === "object" ? field.value : {}) as RegionValue}
          onChange={field.onChange}
          onBlur={field.onBlur}
          label={p.field.label ?? ""}
          level={level}
          {...aria}
        />
      )}
    />
  )
}

const SUBMITTER_LABELS: Record<string, string> = { name: "نام", username: "نام کاربری", unit: "واحد", position: "سمت", mobile: "موبایل", email: "ایمیل" }

/** مشخصات ثبت‌کننده: فقط‌خواندنی از کاربر جاری؛ سرور هنگام ثبت نهایی همین‌ها را ذخیره می‌کند. */
export function SubmitterField(p: FieldProps) {
  const { user } = useAuth()
  const items = (p.field.props?.items as string[] | undefined) ?? ["name", "unit", "position"]
  const values: Record<string, string | undefined> = {
    name: user?.full_name,
    username: user?.username,
    unit: user?.assignment?.unit,
    position: user?.assignment?.position,
    mobile: user?.mobile,
    email: user?.email,
  }
  return (
    <StaticField label={p.field.label ?? ""} className={p.className} layout={p.layout} hint="هنگام ثبت نهایی خودکار ذخیره می‌شود.">
      <dl className="flex min-h-7 flex-wrap items-center gap-x-6 gap-y-1">
        {items.map((k) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="text-2xs text-muted-foreground">{SUBMITTER_LABELS[k]}</dt>
            <dd className="text-xs" dir={k === "username" || k === "email" ? "ltr" : undefined}>
              {values[k] || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </StaticField>
  )
}

/** پیوست: کشیدن و رها کردن با پیشرفت، نوع‌های مجاز فیلد، دوربین موبایل؛ فهرست فایل‌ها با پیش‌نمایش و حذف. */
export function AttachmentField(p: FieldProps) {
  const props = p.field.props ?? {}
  const multiple = props.multiple === true
  const max = multiple ? Number(props.max_files ?? 5) : 1
  const extensions = (props.extensions as string[] | undefined) ?? undefined
  const [added, setAdded] = React.useState<StoredFile[]>([])
  const saved = asList(useWatch({ control: p.control, name: p.field.id }))
  const known = useFileInfo(saved.filter((x) => !added.some((f) => f.id === x))).data ?? []
  return (
    <FormField
      {...common(p)}
      className={cn(p.className, "col-span-full")}
      render={({ field, id, aria }) => {
        const ids = asList(field.value)
        const files = ids.map((x) => added.find((f) => f.id === x) ?? known.find((f) => f.id === x)).filter((f): f is StoredFile => !!f)
        return (
          <div className="flex flex-col gap-2">
            {files.length > 0 && <AttachmentList files={files} onRemove={async (f) => field.onChange(ids.filter((x) => x !== f.id))} />}
            {ids.length < max && (
              <FileDropzone
                id={id}
                multiple={multiple}
                extensions={extensions}
                camera={props.camera === true}
                onUploaded={(f) => {
                  setAdded((prev) => [...prev, f])
                  field.onChange(multiple ? [...asList(field.value), f.id].slice(0, max) : [f.id])
                }}
                {...aria}
              />
            )}
          </div>
        )
      }}
    />
  )
}

/** امضای ثبت‌کننده: پیش‌نمایش امضای «حساب من» که هنگام ثبت نهایی رونوشت می‌شود. */
export function SignatureField(p: FieldProps) {
  const { user } = useAuth()
  return (
    <StaticField
      label={p.field.label ?? ""}
      required={p.field.required}
      className={p.className}
      layout={p.layout}
      hint={user?.signature ? "هنگام ثبت نهایی، رونوشت این امضا در فرم می‌ماند." : undefined}
    >
      {user?.signature ? (
        <img src={`/api/files/${user.signature}/download/?inline=1`} alt={`امضای ${user.full_name}`} className="h-20 w-fit rounded-md border bg-white p-1" />
      ) : (
        <p className="min-h-7 pt-1 text-xs text-muted-foreground">
          امضایی در «حساب من» ثبت نکرده‌اید.{" "}
          <Link to="/account" className="text-primary underline underline-offset-2">
            بارگذاری امضا
          </Link>
        </p>
      )}
    </StaticField>
  )
}

export function SignaturePadField(p: FieldProps) {
  return (
    <FormField
      {...common(p)}
      className={cn(p.className, "col-span-full")}
      render={({ field, id, aria }) => <SignaturePad id={id} label={p.field.label ?? ""} value={str(field.value)} onChange={field.onChange} {...aria} />}
    />
  )
}
