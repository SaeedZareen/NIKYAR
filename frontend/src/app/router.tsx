import { lazy, Suspense } from "react"
import { createBrowserRouter } from "react-router"
import { AppShell } from "@/components/layout/app-shell"
import { RequireAuth } from "./auth"
import type { Access } from "./navigation"
import { NotFound, PageFallback, RequireAccess, RouteError } from "./route-states"

const LoginPage = lazy(() => import("@/pages/login-page"))
const HomePage = lazy(() => import("@/pages/home-page"))
const UsersPage = lazy(() => import("@/pages/admin/users-page"))
const RolesPage = lazy(() => import("@/pages/admin/roles-page"))
const OrgPage = lazy(() => import("@/pages/admin/org-page"))
const LookupsPage = lazy(() => import("@/pages/admin/lookups-page"))
const AuditPage = lazy(() => import("@/pages/admin/audit-page"))
const DataTablePage = lazy(() => import("@/pages/ui-kit/data-table-page"))
const EmployeePage = lazy(() => import("@/pages/ui-kit/employee-page"))
const FormsPage = lazy(() => import("@/pages/ui-kit/forms-page"))
const ComponentsPage = lazy(() => import("@/pages/ui-kit/components-page"))

/** صفحه با بارگذاری تنبل و (در صورت نیاز) بررسی مجوز. */
const page = (element: React.ReactNode, access?: Access) => (
  <Suspense fallback={<PageFallback />}>
    <RequireAccess access={access}>{element}</RequireAccess>
  </Suspense>
)

export const router = createBrowserRouter([
  { path: "login", element: page(<LoginPage />), errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: page(<HomePage />) },
          { path: "admin/users", element: page(<UsersPage />, "accounts.users.view") },
          { path: "admin/roles", element: page(<RolesPage />, "accounts.roles.manage") },
          { path: "admin/org", element: page(<OrgPage />, "org.view") },
          { path: "admin/lookups", element: page(<LookupsPage />, "lookups.manage") },
          { path: "admin/audit", element: page(<AuditPage />, "audit.view") },
          { path: "ui-kit/data-table", element: page(<DataTablePage />, "superuser") },
          { path: "ui-kit/data-table/:id", element: page(<EmployeePage />, "superuser") },
          { path: "ui-kit/forms", element: page(<FormsPage />, "superuser") },
          { path: "ui-kit/components", element: page(<ComponentsPage />, "superuser") },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
])
