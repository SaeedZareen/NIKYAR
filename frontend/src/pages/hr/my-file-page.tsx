import { useQuery } from "@tanstack/react-query"
import { PageError, PageFallback } from "@/app/route-states"
import { api, unwrap } from "@/lib/api/client"
import { EmployeeView } from "./employee-page"
import { EMPLOYEES_KEY } from "./employees"

/** «پرونده‌ی من»: پرونده‌ی پرسنلی متصل به حساب کاربر، با همه‌ی زبانه‌ها و فقط‌خواندنی. */
export default function MyFilePage() {
  const employee = useQuery({ queryKey: [...EMPLOYEES_KEY, "me"], queryFn: () => unwrap(api.GET("/api/hr/employees/me/")) })
  if (employee.isPending) return <PageFallback />
  if (employee.error) return <PageError error={employee.error} onRetry={() => employee.refetch()} />
  return <EmployeeView data={employee.data} own />
}
