// ساختار منوی اصلی. هر مورد مجوز لازم را اعلام می‌کند و فقط به کاربر دارای مجوز نمایش داده می‌شود.
// ماژول‌ها در فازهای بعد گروه خودشان را اضافه می‌کنند.
import type { LucideIcon } from "lucide-react"
import { Building2, CalendarDays, Component, DatabaseBackup, ListChecks, FormInput, History, LayoutDashboard, ListTree, Settings, ShieldCheck, Table2, Users } from "lucide-react"

/** مجوز مورد نیاز؛ "superuser" یعنی فقط مدیر کل (برای بخش‌های راهنمای توسعه). */
export type Access = string | "superuser" | undefined

type NavItem = { title: string; url: string; icon: LucideIcon; access?: Access; keywords?: string }
type NavGroup = { title: string; items: NavItem[] }

const navigation: NavGroup[] = [
  {
    title: "عمومی",
    items: [{ title: "پیشخوان", url: "/", icon: LayoutDashboard, keywords: "خانه داشبورد" }],
  },
  {
    title: "مدیریت سامانه",
    items: [
      { title: "کاربران", url: "/admin/users", icon: Users, access: "accounts.users.view", keywords: "کاربر حساب گذرواژه" },
      { title: "نقش‌ها و مجوزها", url: "/admin/roles", icon: ShieldCheck, access: "accounts.roles.manage", keywords: "نقش مجوز دسترسی" },
      { title: "ساختار سازمانی", url: "/admin/org", icon: Building2, access: "org.view", keywords: "واحد سمت چارت انتصاب" },
      { title: "فهرست‌های پایه", url: "/admin/lookups", icon: ListTree, access: "lookups.manage", keywords: "فهرست مقدار پایه" },
      { title: "تقویم کاری", url: "/admin/calendar", icon: CalendarDays, access: "workcalendar.manage", keywords: "تعطیلات تقویم روز کاری" },
      { title: "سوابق تغییرات", url: "/admin/audit", icon: History, access: "audit.view", keywords: "سابقه لاگ تغییر" },
      { title: "پشتیبان‌گیری", url: "/admin/backups", icon: DatabaseBackup, access: "backup.manage", keywords: "پشتیبان بک‌آپ بازیابی" },
      { title: "کارهای سامانه", url: "/admin/jobs", icon: ListChecks, access: "jobs.manage", keywords: "کار زمان‌بندی پس‌زمینه" },
      { title: "تنظیمات", url: "/admin/settings", icon: Settings, access: "settings.manage", keywords: "تنظیمات سازمان مشخصات سال مالی" },
    ],
  },
  {
    title: "کیت رابط کاربری",
    items: [
      { title: "جدول داده", url: "/ui-kit/data-table", icon: Table2, access: "superuser", keywords: "جدول فهرست گرید" },
      { title: "فرم‌ها", url: "/ui-kit/forms", icon: FormInput, access: "superuser", keywords: "فرم فیلد ورودی تاریخ" },
      { title: "اجزای پایه", url: "/ui-kit/components", icon: Component, access: "superuser", keywords: "دکمه پنجره اعلان" },
    ],
  },
]

/** منوی قابل دسترس برای کاربر فعلی (گروه‌های خالی حذف می‌شوند). */
export function visibleNavigation(can: (permission: string) => boolean, isSuperuser: boolean): NavGroup[] {
  const allowed = (access: Access) => access === undefined || (access === "superuser" ? isSuperuser : can(access))
  return navigation.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.access)) })).filter((g) => g.items.length > 0)
}
