import { lazy } from "react";
import { Contact, PieChart } from "lucide-react";
import type { FrontModule } from "@/app/modules";

const List = lazy(() => import("./EmployeeListPage"));
const Detail = lazy(() => import("./EmployeePage"));
const Report = lazy(() => import("./PersonnelReportPage"));

export const personnelModule: FrontModule = {
  code: "personnel",
  nav: [{
    title: "منابع انسانی", order: 20, items: [
      { to: "/personnel", label: "پرونده‌های پرسنلی", icon: Contact, perm: "personnel.employee.view", end: true },
      { to: "/personnel/report", label: "گزارش نیروی انسانی", icon: PieChart, perm: "personnel.employee.view" },
    ],
  }],
  routes: [
    { path: "/personnel", element: <List />, perm: "personnel.employee.view" },
    { path: "/personnel/report", element: <Report />, perm: "personnel.employee.view" },
    { path: "/personnel/:id", element: <Detail />, perm: "personnel.employee.view" },
  ],
};
