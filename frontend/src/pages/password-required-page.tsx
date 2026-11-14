import * as React from "react"
import { LogOut } from "lucide-react"
import { useLogout } from "@/app/auth"
import { BrandMark } from "@/components/layout/brand-mark"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { PasswordTab } from "@/pages/account/password-tab"

/** گذرواژه‌ی موقت (تعیین‌شده به دست راهبر) یا منقضی: پیش از هر کار گذرواژه‌ی تازه؛ سرور هم بقیه‌ی API را می‌بندد. */
export default function PasswordRequiredPage() {
  const logout = useLogout()
  React.useEffect(() => {
    document.title = "تعیین گذرواژه‌ی تازه · نیک‌یار"
  }, [])
  return (
    <main className="flex min-h-svh items-start justify-center bg-background p-4 sm:items-center">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10 rounded-lg text-lg" />
          <h1 className="flex-1 text-lg font-bold">تعیین گذرواژه‌ی تازه</h1>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
            <LogOut /> خروج
          </Button>
        </div>
        <Alert>
          <AlertDescription>گذرواژه‌ی فعلی شما موقت است یا اعتبارش پایان یافته است. برای ادامه، گذرواژه‌ی تازه‌ای انتخاب کنید که فقط خودتان بدانید.</AlertDescription>
        </Alert>
        <PasswordTab title="گذرواژه‌ی تازه" />
      </div>
    </main>
  )
}
