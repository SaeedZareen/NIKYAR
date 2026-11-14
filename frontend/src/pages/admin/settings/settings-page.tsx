import * as React from "react"
import { useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { SectionNav } from "@/components/layout/section-nav"
import { api, unwrap } from "@/lib/api/client"
import { BackupSection } from "./backup-section"
import { FilesSection } from "./files-section"
import { FiscalYearSection } from "./fiscal-year-section"
import { MessagingSection } from "./messaging-section"
import { NotificationTemplatesSection } from "./notification-templates-section"
import { NumberingSection } from "./numbering-section"
import { OrgProfileSection } from "./org-profile-section"
import { SystemSection } from "./system-section"
import { MonitoringSection } from "./monitoring-section"
import { WorkWeekSection } from "./work-week-section"
import type { SectionInfo } from "./settings-form"
import { HrLeaveSection } from "@/pages/hr/settings-leave"
import { HrLettersSection } from "@/pages/hr/settings-letters"
import { HrOnboardingSection } from "@/pages/hr/settings-onboarding"
import { HrServiceSection } from "@/pages/hr/settings-service"
import { HrWelfareSection } from "@/pages/hr/settings-welfare"
import { HrRolesSection } from "@/pages/hr/settings-roles"

/** فرم هر بخش اعلام‌شده در سرور (nikyar_settings)؛ ماژول‌ها بخش خودشان را اینجا اضافه می‌کنند. */
const SECTION_FORMS: Record<string, (section: SectionInfo) => React.ReactNode> = {
  "org-profile": (s) => <OrgProfileSection section={s} />,
  "fiscal-year": (s) => <FiscalYearSection section={s} />,
  files: (s) => <FilesSection section={s} />,
  "work-week": (s) => <WorkWeekSection section={s} />,
  numbering: (s) => <NumberingSection section={s} />,
  backup: (s) => <BackupSection section={s} />,
  "notification-templates": (s) => <NotificationTemplatesSection section={s} />,
  messaging: (s) => <MessagingSection section={s} />,
  system: (s) => <SystemSection section={s} />,
  monitoring: (s) => <MonitoringSection section={s} />,
  "hr-roles": (s) => <HrRolesSection section={s} />,
  "hr-leave": (s) => <HrLeaveSection section={s} />,
  "hr-letters": (s) => <HrLettersSection section={s} />,
  "hr-welfare": (s) => <HrWelfareSection section={s} />,
  "hr-onboarding": (s) => <HrOnboardingSection section={s} />,
  "hr-service": (s) => <HrServiceSection section={s} />,
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const sections = useQuery({ queryKey: ["settings", "sections"], queryFn: () => unwrap(api.GET("/api/settings/")) })
  const available = sections.data?.filter((s) => s.code in SECTION_FORMS)
  const current = available?.find((s) => s.code === params.get("section")) ?? available?.[0]

  return (
    <>
      <PageHeader title="تنظیمات" description="مشخصات سازمان و تنظیمات بخش‌های سامانه" breadcrumbs={[{ label: "مدیریت سامانه" }]} />
      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Section title="بخش‌ها" contentClassName="p-2">
          <SectionNav
            label="بخش‌های تنظیمات"
            items={available?.map((s) => ({ key: s.code, label: s.title }))}
            current={current?.code}
            onSelect={(section) => setParams({ section }, { replace: true })}
          />
        </Section>
        {current && <React.Fragment key={current.code}>{SECTION_FORMS[current.code](current)}</React.Fragment>}
      </div>
    </>
  )
}
