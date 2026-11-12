// ساختار منوی اصلی. هر مورد مجوز لازم را اعلام می‌کند و فقط به کاربر دارای مجوز نمایش داده می‌شود.
// ماژول‌ها در فازهای بعد گروه خودشان را اضافه می‌کنند.
import type { LucideIcon } from "lucide-react"
import { Bell, ChartColumn, FileCog, FilePlus2, Inbox, ListTodo, Building2, ClipboardList, FileCheck, FileSpreadsheet, PencilRuler, KeyRound, UserRound, UserRoundCog, CalendarDays, Component, DatabaseBackup, ListChecks, FormInput, History, LayoutDashboard, ListTree, Settings, ShieldCheck, Table2, Users, Workflow } from "lucide-react"

/**
 * مجوز مورد نیاز: کد مجوز، "superuser" (فقط مدیر کل؛ راهنمای توسعه)، "workflow-manager" (مجوز مدیریت درخواست‌ها یا مدیر یک فرایند؛ از نشست) یا "forms-viewer"
 * (کسی که ثبت‌های دست‌کم یک فرم را می‌بیند: طراح یا نقش بیننده؛ از نشست).
 */
export type Access = string | "superuser" | "forms-viewer" | "workflow-manager" | undefined

type Viewer = { is_superuser: boolean; forms_viewer: boolean; workflow_manager: boolean } | null

export function isAllowed(access: Access, user: Viewer, can: (permission: string) => boolean): boolean {
  if (access === undefined) return true
  if (access === "superuser") return !!user?.is_superuser
  if (access === "forms-viewer") return !!user?.forms_viewer
  if (access === "workflow-manager") return !!user?.workflow_manager
  return can(access)
}

/** badge: شمارنده‌ی کنار مورد منو (tasks: کارهای منتظر کارتابل). */
type NavItem = { title: string; url: string; icon: LucideIcon; access?: Access; keywords?: string; badge?: "tasks" }
type NavGroup = { title: string; items: NavItem[]; collapsed?: boolean }

const navigation: NavGroup[] = [
  {
    title: "کار من",
    items: [
      { title: "پیشخوان", url: "/", icon: LayoutDashboard, keywords: "خانه داشبورد" },
      { title: "کارتابل", url: "/tasks", icon: Inbox, keywords: "کار منتظر تأیید گردش کار جانشینی گروهی", badge: "tasks" },
      { title: "درخواست جدید", url: "/requests/new", icon: FilePlus2, keywords: "درخواست فرایند ثبت شروع پیش‌نویس گردش کار" },
      { title: "درخواست‌های من", url: "/requests", icon: ListTodo, keywords: "پیگیری درخواست وضعیت مرحله لغو چاپ" },
      { title: "فرم‌ها", url: "/forms", icon: ClipboardList, keywords: "فرم درخواست پر کردن پیش‌نویس" },
      { title: "ثبت‌های من", url: "/forms/mine", icon: FileCheck, keywords: "ثبت فرم پیش‌نویس رسید پیگیری" },
      { title: "ثبت‌های فرم‌ها", url: "/forms/reports", icon: FileSpreadsheet, access: "forms-viewer", keywords: "گزارش ثبت فرم خروجی اکسل چاپ" },
      { title: "اعلان‌ها", url: "/notifications", icon: Bell, keywords: "اعلان پیام زنگوله" },
      { title: "حساب من", url: "/account", icon: UserRound, keywords: "گذرواژه امضا جانشین پروفایل" },
    ],
  },
  {
    title: "فرم‌ساز و فرایندساز",
    items: [
      { title: "طراحی فرم‌ها", url: "/forms/design", icon: PencilRuler, access: "forms.design", keywords: "فرم‌ساز طراح فرم ساخت فرم انتشار الگو" },
      { title: "مدیریت درخواست‌ها", url: "/workflow/requests", icon: FileCog, access: "workflow-manager", keywords: "مدیریت درخواست ارجاع دوباره لغو شروع دوباره دیرکرد بی‌گیرنده" },
      { title: "گزارش عملکرد", url: "/workflow/performance", icon: ChartColumn, access: "workflow-manager", keywords: "گزارش عملکرد گلوگاه زمان مرحله بار کاری دیرکرد نمودار" },
      { title: "طراحی فرایندها", url: "/workflow/design", icon: Workflow, access: "workflow.design", keywords: "فرایندساز گردش کار مرحله تأیید BPMN" },
    ],
  },
  {
    title: "سازمان و کاربران",
    items: [
      { title: "کاربران", url: "/admin/users", icon: Users, access: "accounts.users.view", keywords: "کاربر حساب گذرواژه" },
      { title: "نقش‌ها و مجوزها", url: "/admin/roles", icon: ShieldCheck, access: "accounts.roles.manage", keywords: "نقش مجوز دسترسی" },
      { title: "ساختار سازمانی", url: "/admin/org", icon: Building2, access: "org.view", keywords: "واحد سمت چارت انتصاب" },
      { title: "جانشینی‌ها", url: "/admin/delegations", icon: UserRoundCog, access: "delegation.manage", keywords: "جانشین مرخصی نیابت" },
    ],
  },
  {
    title: "پیکربندی",
    items: [
      { title: "تنظیمات", url: "/admin/settings", icon: Settings, access: "settings.manage", keywords: "تنظیمات سازمان مشخصات سال مالی شماره‌گذاری اعلان" },
      { title: "فهرست‌های پایه", url: "/admin/lookups", icon: ListTree, access: "lookups.manage", keywords: "فهرست مقدار پایه" },
      { title: "تقویم کاری", url: "/admin/calendar", icon: CalendarDays, access: "workcalendar.manage", keywords: "تعطیلات تقویم روز کاری" },
    ],
  },
  {
    title: "نگه‌داری سامانه",
    items: [
      { title: "پشتیبان‌گیری", url: "/admin/backups", icon: DatabaseBackup, access: "backup.manage", keywords: "پشتیبان بک‌آپ بازیابی" },
      { title: "کارهای سامانه", url: "/admin/jobs", icon: ListChecks, access: "jobs.manage", keywords: "کار زمان‌بندی پس‌زمینه" },
      { title: "سوابق تغییرات", url: "/admin/audit", icon: History, access: "audit.view", keywords: "سابقه لاگ تغییر" },
      { title: "ماژول‌ها و لایسنس", url: "/admin/license", icon: KeyRound, access: "license.manage", keywords: "لایسنس مجوز ماژول اعتبار" },
    ],
  },
  {
    // راهنمای توسعه، فقط برای مدیر کل؛ پیش‌فرض بسته
    title: "کیت رابط کاربری",
    collapsed: true,
    items: [
      { title: "جدول داده", url: "/ui-kit/data-table", icon: Table2, access: "superuser", keywords: "جدول فهرست گرید" },
      { title: "اجزای فرم", url: "/ui-kit/forms", icon: FormInput, access: "superuser", keywords: "فرم فیلد ورودی تاریخ" },
      { title: "اجزای پایه", url: "/ui-kit/components", icon: Component, access: "superuser", keywords: "دکمه پنجره اعلان" },
    ],
  },
]

/** مورد منو برای نشانی فعلی: دقیق‌ترین پیوند (طولانی‌ترین پیشوند)؛ «/forms/design/۵» مال «طراحی فرم‌ها» است نه «فرم‌ها». */
export function activeUrl(pathname: string): string | undefined {
  const urls = navigation.flatMap((g) => g.items.map((i) => i.url))
  return urls
    .filter((u) => (u === "/" ? pathname === "/" : pathname === u || pathname.startsWith(`${u}/`)))
    .sort((a, b) => b.length - a.length)[0]
}

/** منوی قابل دسترس برای کاربر فعلی (گروه‌های خالی حذف می‌شوند). */
export function visibleNavigation(user: Viewer, can: (permission: string) => boolean): NavGroup[] {
  return navigation.map((g) => ({ ...g, items: g.items.filter((i) => isAllowed(i.access, user, can)) })).filter((g) => g.items.length > 0)
}
