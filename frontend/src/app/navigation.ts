// ساختار منوی اصلی. هر ماژول در فازهای بعد گروه خودش را اضافه می‌کند.
import type { LucideIcon } from "lucide-react"
import { Component, FormInput, Table2 } from "lucide-react"

export type NavItem = { title: string; url: string; icon: LucideIcon; keywords?: string }
export type NavGroup = { title: string; items: NavItem[] }

export const navigation: NavGroup[] = [
  {
    title: "کیت رابط کاربری",
    items: [
      { title: "جدول داده", url: "/ui-kit/data-table", icon: Table2, keywords: "جدول فهرست گرید" },
      { title: "فرم‌ها", url: "/ui-kit/forms", icon: FormInput, keywords: "فرم فیلد ورودی تاریخ" },
      { title: "اجزای پایه", url: "/ui-kit/components", icon: Component, keywords: "دکمه پنجره اعلان" },
    ],
  },
]
