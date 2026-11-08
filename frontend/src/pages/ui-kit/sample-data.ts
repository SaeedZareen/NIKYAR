// داده‌ی نمونه‌ی کیت رابط کاربری (تولید قطعی، بدون سرور). در فاز پرونده‌ی پرسنلی با داده‌ی واقعی جایگزین می‌شود.
import { toJalaliString } from "@/lib/format"

export type EmploymentStatus = "active" | "leave" | "terminated"
type EmploymentType = "permanent" | "contract" | "project"

export type Employee = {
  id: string
  code: string
  firstName: string
  lastName: string
  nationalId: string
  mobile: string
  unit: string
  position: string
  type: EmploymentType
  status: EmploymentStatus
  hireDate: string
  salary: number
}

export const STATUS_LABELS: Record<EmploymentStatus, string> = { active: "شاغل", leave: "در مرخصی", terminated: "قطع همکاری" }
export const TYPE_LABELS: Record<EmploymentType, string> = { permanent: "رسمی", contract: "قراردادی", project: "پروژه‌ای" }

const FIRST = ["رضا", "مریم", "علی", "زهرا", "محمد", "سارا", "حسین", "فاطمه", "مهدی", "نرگس", "امیر", "لیلا", "حمید", "الهام", "سعید", "مینا"]
const LAST = ["احمدی", "کریمی", "رضایی", "محمدی", "حسینی", "موسوی", "نوری", "جعفری", "صادقی", "رحیمی", "کاظمی", "قاسمی", "یزدانی", "شریفی"]
const UNITS: [string, string[]][] = [
  ["مدیریت عامل", ["مدیرعامل", "دستیار مدیرعامل"]],
  ["امور مالی", ["مدیر مالی", "حسابدار", "کارشناس خزانه‌داری"]],
  ["منابع انسانی", ["مدیر منابع انسانی", "کارشناس امور پرسنلی", "کارشناس آموزش"]],
  ["فناوری اطلاعات", ["مدیر فناوری اطلاعات", "برنامه‌نویس", "کارشناس شبکه"]],
  ["بازرگانی", ["مدیر بازرگانی", "کارشناس خرید", "کارشناس فروش"]],
]

/** مولد عدد شبه‌تصادفی قطعی تا داده در هر بار بارگذاری یکسان باشد. */
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
}

/** کد ملی معتبر از ۹ رقم اول. */
function nationalIdFrom(nine: string) {
  const sum = [...nine].reduce((a, d, i) => a + Number(d) * (10 - i), 0)
  const r = sum % 11
  return nine + (r < 2 ? r : 11 - r)
}

function makeEmployees(count: number): Employee[] {
  const rnd = random(1405)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
  return Array.from({ length: count }, (_, i) => {
    const [unit, positions] = pick(UNITS)
    const hire = new Date(2012 + Math.floor(rnd() * 13), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))
    const r = rnd()
    return {
      id: String(i + 1),
      code: String(1001 + i),
      firstName: pick(FIRST),
      lastName: pick(LAST),
      nationalId: nationalIdFrom(String(Math.floor(rnd() * 1e9)).padStart(9, "0")),
      mobile: `09${String(Math.floor(rnd() * 1e9)).padStart(9, "0")}`,
      unit,
      position: pick(positions),
      type: pick<EmploymentType>(["permanent", "contract", "contract", "project"]),
      status: r < 0.8 ? "active" : r < 0.92 ? "leave" : "terminated",
      hireDate: toJalaliString(hire),
      salary: Math.round((18 + rnd() * 60) * 1e6 / 1e5) * 1e5,
    }
  })
}

export const UNIT_NAMES = UNITS.map(([u]) => u)
export const employees = makeEmployees(240)

/** فرم نمونه‌ی فرم‌ساز با همه‌ی نوع فیلدهای پایه (ساخت از «کیت › فرم‌ها» برای امتحان صفحه‌ی «فرم‌ها» پیش از طراح دیداری). */
export const SAMPLE_FORM_DEFINITION = {
  sections: [
    {
      id: "request",
      title: "مشخصات درخواست",
      columns: 2,
      fields: [
        { id: "intro", type: "paragraph", span: 2, props: { content: "این فرم نمونه‌ی نمایشگر فرم‌ساز است. پیش‌نویس هنگام پر کردن خودکار ذخیره می‌شود." } },
        { id: "title", type: "text", label: "عنوان درخواست", required: true, props: { min_length: 3, max_length: 100 } },
        {
          id: "kind",
          type: "choice",
          label: "نوع درخواست",
          required: true,
          props: {
            display: "select",
            options: [
              { value: "goods", label: "خرید کالا" },
              { value: "service", label: "خرید خدمات" },
              { value: "repair", label: "تعمیر" },
            ],
          },
        },
        { id: "need_date", type: "date", label: "تاریخ نیاز", help: "تاریخی که کالا یا خدمت باید آماده باشد؛ از امروز به بعد.", props: { range: "future" } },
        { id: "delivery_time", type: "time", label: "ساعت تحویل" },
        { id: "estimate", type: "amount", label: "مبلغ برآوردی", required: true, props: { max: 50_000_000_000 } },
        { id: "qty", type: "number", label: "تعداد", props: { min: 1, max: 10_000, unit: "عدد" } },
        { id: "weight", type: "number", label: "وزن تقریبی", props: { decimals: 2, unit: "کیلوگرم" } },
      ],
    },
    {
      id: "details",
      title: "جزئیات",
      columns: 2,
      fields: [
        {
          id: "sourcing",
          type: "multi_choice",
          label: "روش‌های تأمین",
          help: "یک یا چند روش را انتخاب کنید.",
          props: {
            min_select: 1,
            options: [
              { value: "stock", label: "از انبار" },
              { value: "local", label: "خرید محلی" },
              { value: "tender", label: "استعلام و مناقصه" },
            ],
          },
        },
        { id: "urgent", type: "boolean", label: "فوری است؟", required: true },
        {
          id: "priority",
          type: "choice",
          label: "اولویت",
          props: {
            options: [
              { value: "low", label: "کم" },
              { value: "normal", label: "متوسط" },
              { value: "high", label: "زیاد" },
            ],
          },
        },
        { id: "sep", type: "divider" },
        { id: "description", type: "textarea", label: "شرح", span: 2, props: { max_length: 500, rows: 3 } },
      ],
    },
  ],
}
