import { lazy } from "react";
import { Building2, FileCheck2, FormInput, GitBranch, History, Inbox, LayoutDashboard, ListTree, Plus, Puzzle, Search, ShieldCheck, Users } from "lucide-react";
import type { FrontModule } from "@/app/modules";

const Dashboard = lazy(() => import("./dashboard/DashboardPage"));
const InboxPage = lazy(() => import("./workflow/InboxPage"));
const TaskPage = lazy(() => import("./workflow/TaskPage"));
const NewRequest = lazy(() => import("./workflow/NewRequestPage"));
const Instances = lazy(() => import("./workflow/InstancesPage"));
const Instance = lazy(() => import("./workflow/InstancePage"));
const Processes = lazy(() => import("./workflow/ProcessListPage"));
const Designer = lazy(() => import("./workflow/ProcessDesignerPage"));
const Forms = lazy(() => import("./forms/FormListPage"));
const FormBuilder = lazy(() => import("./forms/FormBuilderPage"));
const Lookups = lazy(() => import("./lookups/LookupsPage"));
const Org = lazy(() => import("./org/OrgPage"));
const UsersPage = lazy(() => import("./org/UsersPage"));
const Roles = lazy(() => import("./org/RolesPage"));
const Modules = lazy(() => import("./system/ModulesPage"));
const Audit = lazy(() => import("./system/AuditPage"));
const Profile = lazy(() => import("./system/ProfilePage"));

export const coreModule: FrontModule = {
  code: "core",
  nav: [
    { title: "", order: 0, items: [{ to: "/", label: "پیشخوان", icon: LayoutDashboard, end: true }] },
    {
      title: "کارتابل و درخواست‌ها", order: 10, items: [
        { to: "/inbox", label: "کارتابل", icon: Inbox, badge: "inbox", end: true },
        { to: "/new", label: "ثبت درخواست جدید", icon: Plus },
        { to: "/requests", label: "پیگیری درخواست‌ها", icon: Search },
        { to: "/inbox/done", label: "کارهای انجام‌شده", icon: FileCheck2 },
      ],
    },
    {
      title: "طراحی (بدون کدنویسی)", order: 80, items: [
        { to: "/processes", label: "فرایندساز", icon: GitBranch, perm: "workflow.design" },
        { to: "/forms", label: "فرم‌ساز", icon: FormInput, perm: "core.forms.manage" },
        { to: "/lookups", label: "فهرست‌های پایه", icon: ListTree, perm: "core.lookups.manage" },
      ],
    },
    {
      title: "مدیریت سامانه", order: 90, items: [
        { to: "/org", label: "ساختار سازمانی", icon: Building2, perm: "core.org.manage" },
        { to: "/users", label: "کاربران", icon: Users, perm: "core.users.manage" },
        { to: "/roles", label: "نقش‌ها و دسترسی‌ها", icon: ShieldCheck, perm: "core.roles.manage" },
        { to: "/audit", label: "سوابق تغییرات", icon: History, perm: "core.audit.view" },
        { to: "/modules", label: "ماژول‌ها و لایسنس", icon: Puzzle, perm: "core.settings.manage" },
      ],
    },
  ],
  routes: [
    { path: "/", element: <Dashboard /> },
    { path: "/inbox", element: <InboxPage box="inbox" /> },
    { path: "/inbox/done", element: <InboxPage box="done" /> },
    { path: "/tasks/:id", element: <TaskPage /> },
    { path: "/new", element: <NewRequest /> },
    { path: "/requests", element: <Instances /> },
    { path: "/requests/:id", element: <Instance /> },
    { path: "/processes", element: <Processes />, perm: "workflow.design" },
    { path: "/processes/:id", element: <Designer />, perm: "workflow.design" },
    { path: "/forms", element: <Forms />, perm: "core.forms.manage" },
    { path: "/forms/:key", element: <FormBuilder />, perm: "core.forms.manage" },
    { path: "/lookups", element: <Lookups />, perm: "core.lookups.manage" },
    { path: "/lookups/:code", element: <Lookups />, perm: "core.lookups.manage" },
    { path: "/org", element: <Org />, perm: "core.org.manage" },
    { path: "/users", element: <UsersPage />, perm: "core.users.manage" },
    { path: "/roles", element: <Roles />, perm: "core.roles.manage" },
    { path: "/audit", element: <Audit />, perm: "core.audit.view" },
    { path: "/modules", element: <Modules />, perm: "core.settings.manage" },
    { path: "/profile", element: <Profile /> },
  ],
};

