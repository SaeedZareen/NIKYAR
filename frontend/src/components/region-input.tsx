import { useQuery } from "@tanstack/react-query"
import { SearchPicker } from "@/components/search-picker"
import { api, unwrap } from "@/lib/api/client"

export type RegionValue = { province?: string; city?: string }

/**
 * استان و شهر (یا شهرستان) از تقسیمات کشوری همراه برنامه: با انتخاب استان، فقط شهرهای همان استان.
 * در فرم‌ساز (فیلد «استان و شهر») و پرونده‌ی پرسنلی.
 */
export function RegionInput({
  id,
  value,
  onChange,
  onBlur,
  label,
  level = "cities",
  ...aria
}: {
  id?: string
  value: RegionValue
  onChange: (value: RegionValue) => void
  onBlur?: () => void
  /** نام فیلد برای نام دسترس‌پذیر کادر دوم («… — شهر»). */
  label: string
  level?: "cities" | "counties"
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-required"?: boolean
}) {
  const regions = useQuery({ queryKey: ["forms", "regions"], queryFn: () => unwrap(api.GET("/api/forms/regions/")), staleTime: Infinity }).data ?? []
  const provinces = regions.map((r) => ({ value: r.name, label: r.name }))
  const places = (regions.find((r) => r.name === value.province)?.[level] ?? []).map((c) => ({ value: c, label: c }))
  const placeLabel = level === "counties" ? "شهرستان" : "شهر"
  return (
    <div className="grid gap-2 @md:grid-cols-2">
      <SearchPicker id={id} options={provinces} value={value.province ?? ""} onChange={(x) => onChange({ province: String(x) })} onBlur={onBlur} placeholder="استان" {...aria} />
      <SearchPicker
        options={places}
        value={value.city ?? ""}
        onChange={(x) => onChange({ ...value, city: String(x) })}
        onBlur={onBlur}
        disabled={!value.province}
        placeholder={placeLabel}
        aria-label={`${label} — ${placeLabel}`}
        aria-invalid={aria["aria-invalid"]}
      />
    </div>
  )
}
