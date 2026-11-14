import { useSearchParams } from "react-router"
import { useAuth } from "@/app/auth"
import { PageHeader } from "@/components/layout/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DelegationTab } from "./delegation-tab"
import { DevicesTab } from "./devices-tab"
import { NotificationsTab } from "./notifications-tab"
import { PasswordTab } from "./password-tab"
import { ProfileTab } from "./profile-tab"

const TABS = [
  { value: "profile", label: "مشخصات من" },
  { value: "password", label: "گذرواژه" },
  { value: "devices", label: "دستگاه‌ها" },
  { value: "notifications", label: "اعلان‌ها" },
  { value: "delegation", label: "جانشینی" },
] as const

/** «حساب من»: مشخصات و امضا، گذرواژه، دستگاه‌ها، دریافت اعلان‌ها و جانشینی؛ زبانه‌ی فعال در نشانی صفحه. */
export default function AccountPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  if (!user) return null
  const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab")! : "profile"

  return (
    <>
      <PageHeader title="حساب من" meta={`${user.title} · ${user.username}`} />
      <Tabs value={tab} onValueChange={(t) => setParams(t === "profile" ? {} : { tab: t }, { replace: true })} className="gap-4">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab me={user} />
        </TabsContent>
        <TabsContent value="password">
          <PasswordTab />
        </TabsContent>
        <TabsContent value="devices">
          <DevicesTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="delegation">
          <DelegationTab userId={user.id} />
        </TabsContent>
      </Tabs>
    </>
  )
}
