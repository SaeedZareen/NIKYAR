import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { FileDown } from "lucide-react"
import type { FormDefinition } from "@/components/form-renderer/definition"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { formatDateTime, formatNumber, toFaDigits } from "@/lib/format"
import type { FieldTypeSpec } from "./designer-model"
import { diffDefinitions, isEmptyDiff, type Change } from "./version-diff"

const KIND = { added: { label: "افزوده", tone: "success" }, removed: { label: "حذف‌شده", tone: "destructive" }, changed: { label: "تغییرکرده", tone: "info" } } as const

/** نسخه‌های فرم: فهرست، خروجی هر نسخه، و مقایسه‌ی دو نسخه (چه تغییر کرده). */
export function VersionsSheet({ formId, specs, onOpenChange }: { formId: number; specs: Record<string, FieldTypeSpec>; onOpenChange: (open: boolean) => void }) {
  const versions = useQuery({ queryKey: ["forms", "versions", formId], queryFn: () => unwrap(api.GET("/api/forms/versions/", { params: { query: { form: String(formId) } } })), gcTime: 0 })
  const list = versions.data ?? []
  const [pair, setPair] = React.useState<{ from?: number; to?: number }>({})
  const to = pair.to ?? list[0]?.id
  const from = pair.from ?? list[1]?.id
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="left" className="gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b bg-muted/50 py-3">
          <SheetTitle className="text-sm">نسخه‌های فرم</SheetTitle>
          <SheetDescription>هر انتشار یک نسخه می‌سازد؛ ثبت‌های گذشته با نسخه‌ی خودشان می‌مانند.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-3">
          {versions.isPending && <Spinner />}
          {versions.error && <p className="text-xs text-destructive">{errorMessage(versions.error)}</p>}
          <ul aria-label="نسخه‌ها" className="flex flex-col divide-y rounded-md border">
            {list.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="text-xs font-medium">نسخه‌ی {toFaDigits(v.number)}</span>
                <StatusBadge tone={v.status === "draft" ? "warning" : "success"}>{v.status_label}</StatusBadge>
                <span className="text-2xs text-muted-foreground">
                  {formatNumber(v.field_count)} فیلد
                  {v.published_at && ` · ${formatDateTime(v.published_at)}`}
                  {v.published_by_name && ` · ${v.published_by_name}`}
                </span>
                <Button asChild variant="ghost" size="sm" className="ms-auto">
                  <a href={`/api/forms/${formId}/export/?version=${v.number}`} download aria-label={`خروجی نسخه‌ی ${toFaDigits(v.number)}`}>
                    <FileDown /> خروجی
                  </a>
                </Button>
              </li>
            ))}
          </ul>
          {list.length > 1 && (
            <section aria-label="مقایسه‌ی دو نسخه" className="flex flex-col gap-3">
              <p className="text-xs font-semibold">مقایسه‌ی دو نسخه</p>
              <div className="grid grid-cols-2 gap-2">
                <VersionPick id="diff-from" label="از نسخه" value={from} versions={list} onChange={(v) => setPair((p) => ({ ...p, from: v, to }))} />
                <VersionPick id="diff-to" label="تا نسخه" value={to} versions={list} onChange={(v) => setPair((p) => ({ ...p, to: v, from }))} />
              </div>
              {from && to && from !== to && <Comparison from={from} to={to} specs={specs} />}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function VersionPick({ id, label, value, versions, onChange }: { id: string; label: string; value?: number; versions: { id: number; number: number; status_label: string }[]; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={String(v.id)}>
              نسخه‌ی {toFaDigits(v.number)} ({v.status_label})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function useDefinition(id: number) {
  return useQuery({ queryKey: ["forms", "version-definition", id], queryFn: () => unwrap(api.GET("/api/forms/versions/{id}/", { params: { path: { id } } })), gcTime: 0 })
}

function Comparison({ from, to, specs }: { from: number; to: number; specs: Record<string, FieldTypeSpec> }) {
  const a = useDefinition(from)
  const b = useDefinition(to)
  if (!a.data || !b.data) return <Spinner />
  const propTitle = (type: string, name: string) => specs[type]?.props.find((p) => p.name === name)?.title ?? name
  const diff = diffDefinitions(a.data.definition as FormDefinition, b.data.definition as FormDefinition, propTitle)
  if (isEmptyDiff(diff)) return <p className="text-xs text-muted-foreground">این دو نسخه تفاوتی ندارند.</p>
  return (
    <div className="flex flex-col gap-3">
      {diff.form.length > 0 && (
        <ul className="list-disc ps-5 text-xs">
          {diff.form.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <ChangeList title="بخش‌ها" changes={diff.sections} />
      <ChangeList title="فیلدها" changes={diff.fields} />
    </div>
  )
}

function ChangeList({ title, changes }: { title: string; changes: Change[] }) {
  if (!changes.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">
        {title} <span className="text-2xs font-normal text-muted-foreground">({formatNumber(changes.length)} مورد)</span>
      </p>
      <ul aria-label={`تغییر ${title}`} className="flex flex-col gap-1.5">
        {changes.map((c) => (
          <li key={`${c.kind}-${c.id}`} className="flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5">
            <span className="flex items-center gap-2 text-xs">
              <StatusBadge tone={KIND[c.kind].tone}>{KIND[c.kind].label}</StatusBadge>
              {c.label}
            </span>
            {c.details.length > 0 && (
              <ul className="list-disc ps-5 text-2xs text-muted-foreground">
                {c.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
