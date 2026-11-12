import { Link } from "react-router"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "@/app/auth"
import { visibleNavigation } from "@/app/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { pendingTotal, useTaskCounts } from "@/app/workflow"
import { formatDate, formatNumber } from "@/lib/format"

/** پیشخوان: خوشامد، سمت‌های فعلی کاربر و دسترسی سریع به بخش‌های مجاز. */
export default function HomePage() {
  const { user, can } = useAuth()
  if (!user) return null
  const sections = visibleNavigation(user, can).flatMap((g) => g.items.filter((i) => i.url !== "/"))

  return (
    <>
      <PageHeader title="پیشخوان" meta={`${user.title}، خوش آمدید · ${formatDate(new Date(), "full")}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <InboxCard />
        <Section title="سمت‌های من">
          {user.positions.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {user.positions.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">برای شما سمتی در ساختار سازمانی ثبت نشده است.</p>
          )}
        </Section>
        <Section title="دسترسی سریع" className="lg:col-span-3">
          {sections.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {sections.map((s) => (
                <li key={s.url}>
                  <Link
                    to={s.url}
                    className="group flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <s.icon className="size-4 text-primary" aria-hidden />
                    <span className="flex-1">{s.title}</span>
                    <ArrowLeft className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">هنوز بخشی برای شما فعال نشده است؛ با راهبر سامانه تماس بگیرید.</p>
          )}
        </Section>
      </div>
    </>
  )
}

/** کارهای منتظر کارتابل به تفکیک زبانه. */
function InboxCard() {
  const counts = useTaskCounts().data
  const total = pendingTotal(counts)
  const rows = [
    { box: "", label: "منتظر من", n: counts?.mine ?? 0 },
    { box: "?box=group", label: "گروهی", n: counts?.group ?? 0 },
    { box: "?box=delegated", label: "جانشینی", n: counts?.delegated ?? 0 },
  ]
  return (
    <Section title="کارتابل" meta={total ? `${formatNumber(total)} کار منتظر` : "کاری منتظر نیست"}>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.label}>
            <Link to={`/tasks${r.box}`} className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 outline-none">
              <span>{r.label}</span>
              <span className={r.n ? "font-semibold tabular-nums text-primary" : "tabular-nums text-muted-foreground"}>{formatNumber(r.n)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}
