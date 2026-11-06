import * as React from "react"
import { Link } from "react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { InfoTip } from "@/components/info-tip"
import { usePageTitle } from "./page-tabs"

type Crumb = { label: string; to?: string }

type Props = {
  title: string
  /** راهنمای صفحه: جمع‌شده در نشانه‌ی ⓘ کنار عنوان. */
  description?: React.ReactNode
  /** اطلاعات پویای صفحه که همیشه دیده می‌شود (مثل خوشامد یا مشخصات رکورد)، با متن کوچک زیر عنوان. */
  meta?: React.ReactNode
  breadcrumbs?: Crumb[]
  /** اقدام‌های صفحه؛ فقط یک اقدام اصلی (دکمه‌ی پررنگ). */
  actions?: React.ReactNode
}

/** سربرگ فشرده‌ی صفحه: مسیر، عنوان (تنها h1 صفحه) با راهنمای ⓘ، اطلاعات جانبی و نوار اقدام‌ها. عنوان سند و زبانه را هم تنظیم می‌کند. */
export function PageHeader({ title, description, meta, breadcrumbs, actions }: Props) {
  usePageTitle(title)
  const id = React.useId()
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b pb-3">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumb className="mb-1">
            <BreadcrumbList>
              {breadcrumbs.map((c, i) => (
                <React.Fragment key={i}>
                  <BreadcrumbItem>
                    {c.to ? (
                      <BreadcrumbLink asChild>
                        <Link to={c.to}>{c.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      c.label
                    )}
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </React.Fragment>
              ))}
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}
        <div className="flex items-center gap-1">
          <h1 className="truncate text-lg font-bold" aria-describedby={description ? `${id}-description` : undefined}>
            {title}
          </h1>
          {description && (
            <>
              <InfoTip label={`راهنمای ${title}`}>{description}</InfoTip>
              <span id={`${id}-description`} className="sr-only">
                {description}
              </span>
            </>
          )}
        </div>
        {meta && <div className="mt-0.5 text-2xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && (
        <div role="toolbar" aria-label="اقدام‌های صفحه" className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
