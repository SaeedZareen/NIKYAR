import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { DELEGATIONS_KEY } from "@/app/delegations"
import { DelegationSheet } from "@/components/delegation/delegation-sheet"
import { DelegationTable } from "@/components/delegation/delegation-table"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { api, unwrap } from "@/lib/api/client"

/** همه‌ی جانشینی‌ها برای راهبر سامانه یا منابع انسانی؛ تعیین جانشین برای هر کاربر. */
export default function DelegationsPage() {
  const list = useQuery({ queryKey: [...DELEGATIONS_KEY, "all"], queryFn: () => unwrap(api.GET("/api/delegations/", { params: { query: { scope: "all" } } })) })
  const [adding, setAdding] = React.useState(false)
  return (
    <>
      <PageHeader
        title="جانشینی‌ها"
        description="جانشین هر کاربر در یک بازه‌ی تاریخ (مرخصی، مأموریت یا هر غیبت دیگر)؛ در آن بازه همه‌ی کارهای اصیل در همه‌ی فرایندها به جانشین هم می‌رسد. هر کاربر از «حساب من» هم می‌تواند برای خودش جانشین تعیین کند."
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> جانشین جدید
          </Button>
        }
      />
      <DelegationTable
        id="dl"
        caption="جانشینی‌ها"
        rows={list.data ?? []}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        show={{ principal: true, delegate: true }}
        canCancel
        empty="جانشینی ثبت نشده است"
      />
      {adding && <DelegationSheet choosePrincipal open onOpenChange={setAdding} />}
    </>
  )
}
