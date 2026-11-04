// رجیستری ماژول‌های فرانت‌اند؛ هم‌تراز با رجیستری بک‌اند.
// هر ماژول منو و مسیرهای خودش را اعلام می‌کند. منو بر اساس مجوز و لایسنس فیلتر می‌شود.
import type { LucideIcon } from "lucide-react";
import type { RouteObject } from "react-router-dom";
import { coreModule } from "@/core/module";
import { personnelModule } from "@/modules/personnel/module";

export type NavItem = { to: string; label: string; icon: LucideIcon; perm?: string; badge?: "inbox"; end?: boolean };
export type NavGroup = { title: string; items: NavItem[]; order: number };
export type FrontModule = { code: string; nav: NavGroup[]; routes: (RouteObject & { perm?: string; bare?: boolean })[] };

export const MODULES: FrontModule[] = [coreModule, personnelModule];
