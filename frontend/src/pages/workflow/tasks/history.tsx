import { Section } from "@/components/layout/section"
import type { Schemas } from "@/lib/api/client"
import { formatDateTime, formatNumber } from "@/lib/format"

/** تاریخچه‌ی درخواست: شروع، تصمیم هر مرحله با انجام‌دهنده و یادداشت، انتظار، پایان مهلت، پایان یا لغو. */
export function History({ rows }: { rows: Schemas["TaskEvent"][] }) {
  return (
    <Section title="تاریخچه" meta={`${formatNumber(rows.length)} رویداد`}>
      <ol className="flex flex-col gap-3">
        {rows.map((h, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-s-2 border-border ps-3">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-medium">{h.step ? `${h.step}: ${h.decision || h.kind_label}` : h.kind_label}</span>
              {h.actor && (
                <span>
                  {h.actor}
                  {h.on_behalf_of && <span className="text-muted-foreground"> (به نیابت از {h.on_behalf_of})</span>}
                </span>
              )}
            </div>
            <span className="text-2xs text-muted-foreground tabular-nums">{formatDateTime(h.at)}</span>
            {h.comment && <p className="text-xs whitespace-pre-line">{h.comment}</p>}
          </li>
        ))}
      </ol>
    </Section>
  )
}
