import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { DELEGATIONS_KEY } from "@/app/delegations"
import { DelegationSheet } from "@/components/delegation/delegation-sheet"
import { DelegationTable } from "@/components/delegation/delegation-table"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { api, unwrap } from "@/lib/api/client"

/** «حساب من › جانشینی»: جانشین‌های من (هنگام مرخصی یا مأموریت) و کسانی که من جانشینشان هستم. */
export function DelegationTab({ userId }: { userId: number }) {
  const list = useQuery({ queryKey: [...DELEGATIONS_KEY, "mine"], queryFn: () => unwrap(api.GET("/api/delegations/")) })
  const [adding, setAdding] = React.useState(false)
  const given = React.useMemo(() => (list.data ?? []).filter((d) => d.principal === userId), [list.data, userId])
  const received = React.useMemo(() => (list.data ?? []).filter((d) => d.delegate === userId), [list.data, userId])

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="جانشین‌های من"
        description="هنگام مرخصی یا مأموریت، در بازه‌ی تعیین‌شده کارهای شما به کارتابل جانشین هم می‌رسد و او «به نیابت از» شما اقدام می‌کند."
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> جانشین جدید
          </Button>
        }
      >
        <DelegationTable
          id="dg"
          caption="جانشین‌های من"
          rows={given}
          loading={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
          show={{ principal: false, delegate: true }}
          canCancel
          compact
          empty="جانشینی تعیین نکرده‌اید"
        />
      </Section>
      <Section title="من جانشین این افرادم">
        <DelegationTable
          id="dr"
          caption="جانشینی‌های من برای دیگران"
          rows={received}
          loading={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
          show={{ principal: true, delegate: false }}
          canCancel={false}
          compact
          empty="جانشین کسی نیستید"
        />
      </Section>
      {adding && <DelegationSheet open onOpenChange={setAdding} />}
    </div>
  )
}
