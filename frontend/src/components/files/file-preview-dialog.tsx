import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { inlineUrl, isAudio, type StoredFile } from "@/lib/files"

/** پیش‌نمایش تصویر، PDF یا پخش صدا درون سامانه، بدون دانلود. */
export function FilePreviewDialog({ file, onOpenChange }: { file: StoredFile | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        {file && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate" dir="auto">
                {file.name}
              </DialogTitle>
            </DialogHeader>
            <div className="grid min-h-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
              {file.is_image ? (
                <img src={inlineUrl(file)} alt={file.name} className="max-h-[70svh] max-w-full object-contain" />
              ) : isAudio(file) ? (
                <audio controls src={inlineUrl(file)} className="m-6 w-full max-w-md" aria-label={`پخش ${file.name}`} />
              ) : (
                <iframe src={inlineUrl(file)} title={`پیش‌نمایش ${file.name}`} className="h-[70svh] w-full" />
              )}
            </div>
            <DialogFooter>
              <Button asChild variant="outline">
                <a href={file.url} download>
                  <Download /> دانلود
                </a>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
