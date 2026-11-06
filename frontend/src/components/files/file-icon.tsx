import { File, FileArchive, FileImage, FileSpreadsheet, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

const ICONS: Record<string, typeof File> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  zip: FileArchive,
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
  webp: FileImage,
  gif: FileImage,
}

export function FileIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name.split(".").pop()?.toLowerCase() ?? ""] ?? File
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} aria-hidden />
}
