import { useQuery } from "@tanstack/react-query"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { toFaDigits } from "@/lib/format"

type RecordItem = Schemas["RecordItem"]

/** برچسب کوتاه یک مورد: شماره‌ی پیگیری، یا عنوان و شناسه وقتی بی‌شماره است. */
export const recordLabel = (r: Pick<RecordItem, "id" | "number" | "title">) => (r.number ? toFaDigits(r.number) : `${r.title} (${toFaDigits(r.id)})`)

/** نام موارد ذخیره‌شده (شماره و برای موارد دیدنی، ثبت‌کننده و پیوند مشاهده). */
export function useRecordNames(source: string, ids: number[]) {
  const key = [...ids].sort((a, b) => a - b).join(",")
  return useQuery({
    queryKey: ["forms", "record-names", source, key],
    queryFn: () => unwrap(api.GET("/api/forms/record-lookup/", { params: { query: { source, ids: key } } })),
    enabled: !!source && ids.length > 0,
    staleTime: 60_000,
  })
}
