import { lazy, Suspense } from "react"
import { createBrowserRouter } from "react-router"
import { AppShell } from "@/components/layout/app-shell"
import { RequireAuth } from "./auth"
import type { Access } from "./navigation"
import { NotFound, PageFallback, RequireAccess, RouteError } from "./route-states"

const LoginPage = lazy(() => import("@/pages/login-page"))
const HomePage = lazy(() => import("@/pages/home-page"))
const NotificationsPage = lazy(() => import("@/pages/notifications-page"))
const FormsPage = lazy(() => import("@/pages/forms/forms-page"))
const FormFillPage = lazy(() => import("@/pages/forms/fill-page"))
const MySubmissionsPage = lazy(() => import("@/pages/forms/submissions/my-submissions-page"))
const FormReportsPage = lazy(() => import("@/pages/forms/submissions/reports-page"))
const FormReportPage = lazy(() => import("@/pages/forms/submissions/report-page"))
const SubmissionPage = lazy(() => import("@/pages/forms/submissions/submission-page"))
const SubmissionPrintPage = lazy(() => import("@/pages/forms/submissions/print-page"))
const ProcessDesignPage = lazy(() => import("@/pages/workflow/design/process-design-page"))
const ProcessDesignerPage = lazy(() => import("@/pages/workflow/design/process-designer-page"))
const FormsDesignPage = lazy(() => import("@/pages/forms/design/forms-design-page"))
const DesignerPage = lazy(() => import("@/pages/forms/design/designer-page"))
const FormPreviewPage = lazy(() => import("@/pages/forms/design/preview-page"))
const AccountPage = lazy(() => import("@/pages/account/account-page"))
const DelegationsPage = lazy(() => import("@/pages/admin/delegations-page"))
const UsersPage = lazy(() => import("@/pages/admin/users-page"))
const RolesPage = lazy(() => import("@/pages/admin/roles-page"))
const OrgPage = lazy(() => import("@/pages/admin/org-page"))
const LookupsPage = lazy(() => import("@/pages/admin/lookups-page"))
const AuditPage = lazy(() => import("@/pages/admin/audit-page"))
const CalendarPage = lazy(() => import("@/pages/admin/calendar/calendar-page"))
const BackupsPage = lazy(() => import("@/pages/admin/backups/backups-page"))
const JobsPage = lazy(() => import("@/pages/admin/jobs-page"))
const LicensePage = lazy(() => import("@/pages/admin/license-page"))
const SettingsPage = lazy(() => import("@/pages/admin/settings/settings-page"))
const DataTablePage = lazy(() => import("@/pages/ui-kit/data-table-page"))
const EmployeePage = lazy(() => import("@/pages/ui-kit/employee-page"))
const KitFormsPage = lazy(() => import("@/pages/ui-kit/forms-page"))
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
      // پیش‌نمایش فرم درون قاب طراح، بی پوسته‌ی برنامه (پهنای قاب همان پهنای دستگاه است)
      { path: "forms/preview/:versionId", element: page(<FormPreviewPage />, "forms.design") },
      // برگه‌ی چاپ ثبت، بی پوسته‌ی برنامه
      { path: "print/submissions/:id", element: page(<SubmissionPrintPage />) },
      {
        element: <AppShell />,
        children: [
          { index: true, element: page(<HomePage />) },
          { path: "notifications", element: page(<NotificationsPage />) },
          { path: "forms", element: page(<FormsPage />) },
          { path: "forms/:formId/fill", element: page(<FormFillPage />) },
          { path: "forms/mine", element: page(<MySubmissionsPage />) },
          { path: "forms/reports", element: page(<FormReportsPage />, "forms-viewer") },
          { path: "forms/reports/:formId", element: page(<FormReportPage />, "forms-viewer") },
          { path: "forms/submissions/:id", element: page(<SubmissionPage />) },
          { path: "forms/design", element: page(<FormsDesignPage />, "forms.design") },
          { path: "forms/design/:formId", element: page(<DesignerPage />, "forms.design") },
          { path: "workflow/design", element: page(<ProcessDesignPage />, "workflow.design") },
          { path: "workflow/design/:processId", element: page(<ProcessDesignerPage />, "workflow.design") },
          { path: "account", element: page(<AccountPage />) },
          { path: "admin/delegations", element: page(<DelegationsPage />, "delegation.manage") },
          { path: "admin/users", element: page(<UsersPage />, "accounts.users.view") },
          { path: "admin/roles", element: page(<RolesPage />, "accounts.roles.manage") },
          { path: "admin/org", element: page(<OrgPage />, "org.view") },
          { path: "admin/lookups", element: page(<LookupsPage />, "lookups.manage") },
          { path: "admin/audit", element: page(<AuditPage />, "audit.view") },
          { path: "admin/calendar", element: page(<CalendarPage />, "workcalendar.manage") },
          { path: "admin/backups", element: page(<BackupsPage />, "backup.manage") },
          { path: "admin/jobs", element: page(<JobsPage />, "jobs.manage") },
          { path: "admin/license", element: page(<LicensePage />, "license.manage") },
          { path: "admin/settings", element: page(<SettingsPage />, "settings.manage") },
          { path: "ui-kit/data-table", element: page(<DataTablePage />, "superuser") },
          { path: "ui-kit/data-table/:id", element: page(<EmployeePage />, "superuser") },
          { path: "ui-kit/forms", element: page(<KitFormsPage />, "superuser") },
          { path: "ui-kit/components", element: page(<ComponentsPage />, "superuser") },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
])
