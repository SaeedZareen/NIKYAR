import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Bell, Hash, Info, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { AttachmentList, FileDropzone } from "@/components/files"
import { JalaliCalendar } from "@/components/jalali-calendar"
import { PageHeader } from "@/components/layout/page-header"
import { Section as PageSection } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, unwrap } from "@/lib/api/client"
import type { StoredFile } from "@/lib/files"
import { formatDate, formatNumber, toFaDigits } from "@/lib/format"
import { employees, UNIT_NAMES } from "./sample-data"

const chartData = UNIT_NAMES.map((unit) => ({ unit, count: employees.filter((e) => e.unit === unit && e.status === "active").length }))
const chartConfig = { count: { label: "پرسنل شاغل", color: "var(--chart-1)" } } satisfies ChartConfig

/** نمونه‌ی هر گروه از اجزا؛ محتوا در یک ردیف شکسته‌شونده. */
function Section({ title, description, meta, children }: { title: string; description?: string; meta?: string; children: React.ReactNode }) {
  return (
    <PageSection title={title} description={description} meta={meta} contentClassName="flex flex-wrap items-start gap-3">
      {children}
    </PageSection>
  )
}

export default function ComponentsPage() {
  const [date, setDate] = React.useState<Date | undefined>(new Date())

  return (
    <>
      <PageHeader title="اجزای پایه" description="دکمه‌ها، برچسب‌ها، پنجره‌ها، اعلان‌ها، تقویم شمسی و نمودار" breadcrumbs={[{ label: "کیت رابط کاربری" }]} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="دکمه‌ها" description="در هر صفحه فقط یک دکمه‌ی اصلی (پررنگ) باشد.">
          <Button>
            <Save /> ذخیره
          </Button>
          <Button variant="outline">انصراف</Button>
          <Button variant="secondary">پیش‌نویس</Button>
          <Button variant="ghost">بیشتر</Button>
          <Button variant="destructive">
            <Trash2 /> حذف
          </Button>
          <Button variant="link">مشاهده‌ی جزئیات</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="اعلان‌ها">
                <Bell />
              </Button>
            </TooltipTrigger>
            <TooltipContent>اعلان‌ها</TooltipContent>
          </Tooltip>
          <Button disabled>غیرفعال</Button>
        </Section>

        <Section title="برچسب‌ها و وضعیت‌ها" description="رنگ همیشه همراه متن است.">
          <StatusBadge tone="success">تأیید شده</StatusBadge>
          <StatusBadge tone="warning">در انتظار بررسی</StatusBadge>
          <StatusBadge tone="destructive">رد شده</StatusBadge>
          <StatusBadge tone="info">در جریان</StatusBadge>
          <StatusBadge tone="neutral">پیش‌نویس</StatusBadge>
          <Badge>جدید</Badge>
          <Badge variant="outline">{formatNumber(12)} مورد</Badge>
        </Section>

        <Section title="پنجره‌ها" description="تأیید حذف، و پنل کشویی از سمت شروع.">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 /> حذف پرونده
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>پرونده حذف شود؟</AlertDialogTitle>
                <AlertDialogDescription>این کار برگشت‌پذیر نیست و سوابق مرتبط هم بایگانی می‌شوند.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => toast.success("پرونده حذف شد.")}>
                  حذف
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Plus /> پنل کشویی
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>جزئیات درخواست</SheetTitle>
                <SheetDescription>اطلاعات تکمیلی بدون ترک صفحه نمایش داده می‌شود.</SheetDescription>
              </SheetHeader>
              <div className="px-4 text-xs leading-relaxed">درخواست مرخصی استحقاقی سه‌روزه، ثبت‌شده در {formatDate(new Date(), "long")}.</div>
              <SheetFooter>
                <Button onClick={() => toast.success("درخواست تأیید شد.")}>تأیید</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </Section>

        <Section title="اعلان‌ها">
          <Button variant="outline" onClick={() => toast.success("تغییرات ذخیره شد.")}>
            موفق
          </Button>
          <Button variant="outline" onClick={() => toast.error("ذخیره ممکن نشد؛ اتصال را بررسی کنید.")}>
            خطا
          </Button>
          <Button variant="outline" onClick={() => toast.warning("مهلت این کار فردا به پایان می‌رسد.")}>
            هشدار
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.promise(new Promise((r) => setTimeout(r, 1500)), { loading: "در حال ارسال…", success: "ارسال شد.", error: "ارسال ممکن نشد." })
            }
          >
            در حال انجام
          </Button>
          <Alert className="mt-1">
            <Info />
            <AlertTitle>راهنما</AlertTitle>
            <AlertDescription>پیام‌های راهنما داخل صفحه می‌مانند؛ اعلان‌های کوتاه پس از چند ثانیه بسته می‌شوند.</AlertDescription>
          </Alert>
        </Section>

        <Section title="تقویم شمسی" meta={date ? `انتخاب‌شده: ${formatDate(date, "full")}` : "روزی انتخاب نشده است."}>
          <JalaliCalendar value={date ?? null} onChange={(d) => setDate(d ?? undefined)} showTodayButton className="rounded-lg border" />
        </Section>

        <Section title="نمودار" description="پرسنل شاغل به تفکیک واحد">
          <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
            <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="unit" tickLine={false} axisLine={false} reversed fontSize={11} />
              <YAxis orientation="right" tickLine={false} axisLine={false} width={28} tickFormatter={(v: number) => formatNumber(v)} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Section>

        <Section title="زبانه‌ها و پیشرفت">
          <Tabs defaultValue="info" className="w-full">
            <TabsList>
              <TabsTrigger value="info">اطلاعات</TabsTrigger>
              <TabsTrigger value="history">سوابق</TabsTrigger>
              <TabsTrigger value="files">مدارک</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="pt-2 text-xs">
              تکمیل پرونده: {formatNumber(70)}٪
              <Progress value={70} className="mt-2" aria-label="درصد تکمیل پرونده" />
            </TabsContent>
            <TabsContent value="history" className="pt-2 text-xs">
              سوابق تغییرات پرونده در این بخش نمایش داده می‌شود.
            </TabsContent>
            <TabsContent value="files" className="pt-2 text-xs">
              مدارک بارگذاری‌شده در این بخش نمایش داده می‌شود.
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="پیوست‌ها" description="کشیدن و رها کردن، پیشرفت و لغو، پیش‌نمایش تصویر و PDF. نوع و حجم مجاز از تنظیمات خوانده می‌شود.">
          <AttachmentsDemo />
        </Section>

        <Section title="شماره‌گذاری اسناد" description="هر صدور یک شماره‌ی یکتا و پشت‌سرهم می‌گیرد؛ الگو در «تنظیمات › شماره‌گذاری اسناد» تغییر می‌کند.">
          <NumberingDemo />
        </Section>

        <Section title="در حال بارگذاری" description="اسکلت هم‌شکل محتوای نهایی، تا صفحه هنگام رسیدن داده جابه‌جا نشود.">
          <div className="flex w-full items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </Section>
      </div>
    </>
  )
}

function AttachmentsDemo() {
  const [files, setFiles] = React.useState<StoredFile[]>([])
  return (
    <div className="flex w-full flex-col gap-3">
      <FileDropzone multiple onUploaded={(f) => setFiles((prev) => [...prev, f])} />
      <AttachmentList
        files={files}
        onRemove={async (f) => {
          await unwrap(api.DELETE("/api/files/{id}/", { params: { path: { id: f.id } } }))
          setFiles((prev) => prev.filter((x) => x.id !== f.id))
          toast.success(`«${f.name}» حذف شد.`)
        }}
      />
    </div>
  )
}

function NumberingDemo() {
  const [numbers, setNumbers] = React.useState<string[]>([])
  const [pending, setPending] = React.useState(false)
  const issue = async () => {
    setPending(true)
    try {
      const { number } = await unwrap(api.POST("/api/numbering/sequences/sample/issue/"))
      setNumbers((prev) => [number, ...prev].slice(0, 5))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex w-full flex-col gap-3">
      <Button variant="outline" className="self-start" onClick={issue} disabled={pending}>
        <Hash /> صدور شماره‌ی نمونه
      </Button>
      {numbers.length > 0 && (
        <ul aria-label="شماره‌های صادرشده" className="flex flex-wrap gap-2">
          {numbers.map((n) => (
            <li key={n}>
              <Badge variant="secondary" className="tabular-nums">
                <bdi>{toFaDigits(n)}</bdi>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
