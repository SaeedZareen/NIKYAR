import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Section } from "@/components/layout/section"
import { Skeleton } from "@/components/ui/skeleton"
import { api, unwrap } from "@/lib/api/client"
import { formatNumber } from "@/lib/format"

/** ابزارک «نیروی انسانی» پیشخوان برای بینندگان پرونده‌ها: شاغلان، ورود و خروج ماه جاری و مدارک رو به پایان اعتبار. */
export function HrDashboardCard() {
  const { data } = useQuery({ queryKey: ["hr", "dashboard"], queryFn: () => unwrap(api.GET("/api/hr/dashboard/")) })
  const rows = data && [
    { label: "کارکنان شاغل", n: data.active, to: "/hr/employees" },
    { label: `ورود در ${data.month}`, n: data.joins, to: "/hr/report" },
    { label: `خروج در ${data.month}`, n: data.leaves, to: "/hr/report" },
    { label: "مدارک رو به پایان اعتبار", n: data.expiring, to: "/hr/report", warn: true },
  ]
  return (
    <Section title="نیروی انسانی">
      {rows ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.label}>
              <Link to={r.to} className="flex items-center justify-between rounded-md px-2 py-1 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40">
                <span>{r.label}</span>
                <span className={!r.n ? "tabular-nums text-muted-foreground" : r.warn ? "font-semibold tabular-nums text-warning" : "font-semibold tabular-nums text-primary"}>{formatNumber(r.n)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Skeleton className="h-28" />
      )}
    </Section>
  )
}
