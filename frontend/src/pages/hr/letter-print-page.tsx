import { useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { PrintHeader, PrintSheet } from "@/components/print-sheet"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { fileUrl } from "@/lib/files"
import { toFaDigits } from "@/lib/format"

/** برگه‌ی چاپ رسمی نامه یا گواهی پرسنلی: سربرگ سازمان، شماره و تاریخ، متن ثابت‌شده هنگام صدور، و امضای صادرکننده. */
export default function LetterPrintPage() {
  const id = useParams().id ?? ""
  const query = useQuery({ queryKey: ["hr", "letters", id], queryFn: () => unwrap(api.GET("/api/hr/letters/{id}/", { params: { path: { id } } })) })
  const letter = query.data
  return (
    <PrintSheet ready={!!letter} error={query.error} loadingLabel="چاپ نامه" title={letter ? `${letter.kind_label} ${toFaDigits(letter.number)}` : undefined}>
      {() => letter && <LetterSheet letter={letter} />}
    </PrintSheet>
  )
}

function LetterSheet({ letter }: { letter: Schemas["Letter"] }) {
  return (
    <>
      <PrintHeader title={letter.kind_label} number={letter.number} date={toFaDigits(letter.issued_on)} />
      <div className="min-h-[120mm] pt-4 text-sm leading-8 whitespace-pre-line text-justify">{letter.body}</div>
      <footer className="mt-6 flex justify-end break-inside-avoid">
        <div className="flex w-56 flex-col items-center gap-1 text-xs">
          {letter.signer_signature ? (
            <img src={`${fileUrl(letter.signer_signature)}?inline=1`} alt={`امضای ${letter.signer_name}`} className="h-16 object-contain" />
          ) : (
            <span className="h-16" />
          )}
          <span className="w-full border-t border-foreground pt-1 text-center font-semibold">{letter.signer_name || "منابع انسانی"}</span>
          {letter.signer_position && <span className="text-center">{letter.signer_position}</span>}
        </div>
      </footer>
    </>
  )
}
