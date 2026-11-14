import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Section } from "@/components/layout/section"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"

export type StatTile = { label: string; value: string; meta?: string }

/** کاشی‌های خلاصه‌ی گزارش (شمار اصلی درشت، توضیح کوچک زیر آن)؛ تا رسیدن داده، اسکلت. */
export function StatTiles({ tiles, count = 4 }: { tiles?: StatTile[]; count?: number }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles
        ? tiles.map((t) => (
            <div key={t.label} className="flex flex-col gap-1 rounded-lg border bg-background p-3">
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className="text-lg font-bold tabular-nums">{t.value}</dd>
              {t.meta && <dd className="text-2xs text-muted-foreground">{t.meta}</dd>}
            </div>
          ))
        : Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-20" />)}
    </dl>
  )
}

/** نمودار میله‌ای افقی تک‌سری (بی راهنمای رنگ؛ عنوان نام سری است)؛ جدول همراه همان داده را کامل دارد. */
export function RankChart({
  title,
  description,
  rows,
  label,
  empty,
  integer,
  className,
}: {
  title: string
  description?: string
  rows: { name: string; value: number }[]
  label: string
  empty: string
  integer?: boolean
  className?: string
}) {
  const config = { value: { label, color: "var(--chart-1)" } } satisfies ChartConfig
  return (
    <Section title={title} description={description} className={className}>
      {rows.length ? (
        <ChartContainer config={config} className="w-full" style={{ height: rows.length * 36 + 32 }} role="img" aria-label={`${title}: ${rows.map((r) => `${r.name} ${formatNumber(r.value)}`).join("، ")}`}>
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 8 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" reversed allowDecimals={!integer} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v)} fontSize={11} />
            {/* در RTL «end» نام را به سمت راست محور می‌برد، نه روی میله‌ها */}
            <YAxis type="category" dataKey="name" orientation="right" tickLine={false} axisLine={false} width={150} fontSize={11} tick={{ textAnchor: "end" }} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => `${label}: ${formatNumber(Number(v))}`} hideIndicator />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </Section>
  )
}
