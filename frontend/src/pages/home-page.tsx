import { Link } from "react-router"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "@/app/auth"
import { visibleNavigation } from "@/app/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { formatDate } from "@/lib/format"

/** پیشخوان: خوشامد، سمت‌های فعلی کاربر و دسترسی سریع به بخش‌های مجاز. */
export default function HomePage() {
  const { user, can } = useAuth()
  if (!user) return null
  const sections = visibleNavigation(can, user.is_superuser).flatMap((g) => g.items.filter((i) => i.url !== "/"))

  return (
    <>
      <PageHeader title="پیشخوان" description={`${user.title}، خوش آمدید · ${formatDate(new Date(), "full")}`} />
      <div className="grid gap-4 lg:grid-cols-3">
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
        <Section title="دسترسی سریع" className="lg:col-span-2">
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
