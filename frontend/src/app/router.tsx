import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate } from "react-router"
import { AppShell } from "@/components/layout/app-shell"
import { NotFound, PageFallback, RouteError } from "./route-states"

const DataTablePage = lazy(() => import("@/pages/ui-kit/data-table-page"))
const EmployeePage = lazy(() => import("@/pages/ui-kit/employee-page"))
const FormsPage = lazy(() => import("@/pages/ui-kit/forms-page"))
const ComponentsPage = lazy(() => import("@/pages/ui-kit/components-page"))

const page = (element: React.ReactNode) => <Suspense fallback={<PageFallback />}>{element}</Suspense>

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/ui-kit/data-table" replace /> },
      { path: "ui-kit/data-table", element: page(<DataTablePage />) },
      { path: "ui-kit/data-table/:id", element: page(<EmployeePage />) },
      { path: "ui-kit/forms", element: page(<FormsPage />) },
      { path: "ui-kit/components", element: page(<ComponentsPage />) },
      { path: "*", element: <NotFound /> },
    ],
  },
])
