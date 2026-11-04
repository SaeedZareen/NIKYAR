import { Contact, Package, Receipt, ShoppingCart, Wallet, Workflow, Building2, Clock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/app/auth";
import { KeyValue, PageHeader, Panel, StatusBadge } from "@/app/ui";
import { fa } from "@/lib/utils";

const ICONS: Record<string, typeof Contact> = { "building-2": Building2, workflow: Workflow, contact: Contact };
const STATUS: Record<string, string> = {
  trial: "نسخه‌ی آزمایشی (همه‌ی ماژول‌ها)", valid: "معتبر (امضای دیجیتال تأیید شد)",
  unsigned: "بدون امضا (کلید عمومی فروشنده نصب نشده)", invalid: "نامعتبر",
};
const FUTURE = [
  { title: "حضور و غیاب", desc: "تردد، مرخصی، مأموریت و اضافه‌کار با اتصال به دستگاه‌ها", icon: Clock },
  { title: "حقوق و دستمزد", desc: "احکام، محاسبه‌ی حقوق، بیمه و مالیات", icon: Wallet },
  { title: "انبار و کالا", desc: "کالا، ورود و خروج، موجودی و درخواست کالا", icon: Package },
  { title: "خرید و تدارکات", desc: "درخواست خرید، استعلام، سفارش و تأمین‌کنندگان", icon: ShoppingCart },
  { title: "حسابداری و خزانه", desc: "اسناد، دفاتر، چک و بانک و گزارش‌های مالی", icon: Receipt },
];

export default function ModulesPage() {
  const { system } = useAuth();
  return (
    <>
      <PageHeader title="ماژول‌ها و لایسنس" description="ماژول‌های نصب‌شده و وضعیت لایسنس سازمان" />
      <Panel title="لایسنس" className="mb-6">
        <KeyValue items={[
          { label: "دارنده‌ی لایسنس", value: system?.customer },
          { label: "تاریخ انقضا", value: system?.expires ? fa(system.expires) : "نامحدود" },
          { label: "سقف کاربران فعال", value: system?.max_users ? fa(system.max_users) : "نامحدود" },
          { label: "اعتبار لایسنس", value: STATUS[system?.license_status ?? "trial"] },
        ]} />
        {system?.license_status === "invalid" && <Alert variant="destructive" className="mt-4">امضای فایل لایسنس معتبر نیست؛ فقط ماژول‌های پایه فعال‌اند. با پشتیبانی تماس بگیرید.</Alert>}
        {system?.expired && <Alert variant="destructive" className="mt-4">لایسنس منقضی شده است؛ ماژول‌های تکمیلی غیرفعال‌اند.</Alert>}
      </Panel>
      <h2 className="mb-3 text-lg font-semibold">ماژول‌های نصب‌شده</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {system?.modules.map((m) => {
          const Icon = ICONS[m.icon] ?? Package;
          return (
            <article key={m.code} className="flex min-h-40 flex-col gap-2 rounded-surface border-line border-border bg-card p-5 shadow-surface">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-brand" strokeWidth={1.75} aria-hidden />
                <StatusBadge tone={m.enabled ? "success" : "neutral"} label={m.enabled ? "فعال" : "غیرفعال"} />
              </div>
              <h3 className="font-semibold">{m.title}</h3>
              <p className="flex-1 text-sm text-muted-foreground">{m.description}</p>
              <span className="text-xs text-muted-foreground">{m.is_core ? "ماژول پایه" : "ماژول تکمیلی"}</span>
            </article>
          );
        })}
      </div>
      <h2 className="mb-3 text-lg font-semibold">در نقشه‌ی راه</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FUTURE.map((m) => (
          <article key={m.title} className="flex min-h-36 flex-col gap-2 rounded-surface border-line border-dashed border-border p-5">
            <m.icon className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <h3 className="font-semibold">{m.title}</h3>
            <p className="text-sm text-muted-foreground">{m.desc}</p>
          </article>
        ))}
      </div>
    </>
  );
}
